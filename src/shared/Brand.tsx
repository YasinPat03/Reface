import MetallicPaint from './metallic/MetallicPaint';
import logo from './split-e.svg';

export function Brand({ appearance }: { appearance: 'light' | 'dark' }) {
  return (
    <div className="brand brand-metallic" role="img" aria-label="ReFace">
      <span
        className="brand-logo-fallback"
        style={{ maskImage: `url(${logo})`, WebkitMaskImage: `url(${logo})` }}
      />
      <MetallicPaint
        imageSrc={logo}
        lightMode={appearance === 'light'}
        density={2.4}
        softness={1}
        dispersion={0}
        distortion={0}
        edgeBend={0.62}
        angle={111}
        speed={0.45}
        mouseTilt={0}
        scale={1}
      />
    </div>
  );
}
