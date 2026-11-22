import { afterEach, expect, it, vi } from 'vitest';
import { callContent } from '../src/shared/messages';

afterEach(() => vi.unstubAllGlobals());

const missing = new Error('Could not establish connection. Receiving end does not exist.');
const files = ['injector.js', 'content.js'];

function stubChrome(sendMessage: ReturnType<typeof vi.fn>) {
  const executeScript = vi.fn().mockResolvedValue([]);
  vi.stubGlobal('chrome', {
    tabs: { sendMessage },
    scripting: { executeScript },
    runtime: { getManifest: () => ({ content_scripts: files.map((file) => ({ js: [file] })) }) },
  });
  return executeScript;
}

it('loads the page scripts once for concurrent requests, then retries both messages', async () => {
  const sendMessage = vi
    .fn()
    .mockRejectedValueOnce(missing)
    .mockRejectedValueOnce(missing)
    .mockResolvedValue({ ok: true, data: { host: 'example.com' } });
  const executeScript = stubChrome(sendMessage);

  await expect(
    Promise.all([callContent(17, 'ping', {}), callContent(17, 'ping', {})]),
  ).resolves.toEqual([{ host: 'example.com' }, { host: 'example.com' }]);

  expect(executeScript).toHaveBeenCalledExactlyOnceWith({
    target: { tabId: 17, frameIds: [0] },
    files,
  });
  expect(sendMessage).toHaveBeenCalledTimes(4);
});

it('does not replay a message when the recipient closed the channel after delivery', async () => {
  const sendMessage = vi.fn().mockRejectedValue(new Error('The message port closed.'));
  const executeScript = stubChrome(sendMessage);

  await expect(callContent(17, 'clearPreview', {})).rejects.toThrow('Try again');
  expect(executeScript).not.toHaveBeenCalled();
  expect(sendMessage).toHaveBeenCalledTimes(1);
});
