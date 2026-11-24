---
name: amazon
kind: site
hosts: amazon.com amazon.ca amazon.fr amazon.co.uk amazon.de amazon.es amazon.it amazon.co.jp amazon.com.mx amazon.com.au amazon.in
description: Amazon search results and product pages: nav ids, product cards, sponsored items, buy box.
verify: https://www.amazon.com/s?k=usb+c+cable https://www.amazon.com/dp/B0CG1LGWR6
---

Amazon pages are server-rendered with stable ids (nav-…, #search, #dp) and data attributes. Avoid the utility classes sg-col-* and a-spacing-*: they are shared by everything.

Top: header#navbar-main with #nav-belt (logo #nav-logo, delivery location #nav-global-location-slot, search #nav-search, account #nav-link-accountList, orders #nav-orders, cart #nav-cart) and #nav-main (the "All" hamburger #nav-hamburger-menu, category links #nav-xshop, promo slot #nav-swmslot). Footer: #navFooter.

Search results (/s): #search with the filters column #s-refinements and the results grid .s-main-slot. Each product card is div[data-component-type="s-search-result"] (image .s-image, title [data-cy="title-recipe"] h2, rating [data-cy="reviews-block"], price [data-cy="price-recipe"] / .a-price, delivery [data-cy="delivery-recipe"], badges .a-badge). Sponsored products and carousels are mixed in (label .s-widget-sponsored-label-text "Sponsored", widgets .s-widget, .AdHolder). Pagination: .s-pagination-container.

Product page (/dp/…): #dp with #leftCol (images #imageBlock, thumbnails #altImages, main image #landingImage), #centerCol (title #productTitle, rating #averageCustomerReviews, price #corePrice_feature_div, bullet points #feature-bullets) and #rightCol (buy box #buybox / #desktop_buybox, #add-to-cart-button, #buy-now-button). Below: sponsored carousels #sp_detail, A+ content #aplus, details #productDetails_feature_div, reviews #customerReviews.

Prices are split into spans (.a-price-whole, .a-price-fraction and a hidden .a-offscreen copy): style .a-price as a whole.

Never hide #search, .s-main-slot or #dp as a whole when asked to hide one part.

```components
Top bar | top bar, header, navigation, en-tête, barre du haut, bandeau | header#navbar-main | one
Search box | search, search bar, recherche, barre de recherche | #nav-search | one
Category links | categories, catégories, category links, menu | #nav-main | one
Delivery location | location, address, adresse, livraison, deliver to, localisation | #nav-global-location-slot | one
Cart | cart, panier | #nav-cart | one
Filters | filters, filtres, refinements, left sidebar, barre latérale | #s-refinements | one
Product cards | products, produits, results, résultats, cards, cartes, items, articles | div[data-component-type="s-search-result"] | all
Product images | images, photos, pictures, product images | .s-main-slot .s-image ; #landingImage | all
Product titles | titles, titres, names, noms, product names | [data-cy="title-recipe"] h2 ; #productTitle | all
Prices | prices, prix, price | .a-price | all
Ratings | ratings, reviews, stars, étoiles, avis, notes | [data-cy="reviews-block"] ; #averageCustomerReviews | all
Delivery info | delivery, livraison, shipping | [data-cy="delivery-recipe"] | all
Sponsored | sponsored, ads, ad, pubs, publicités, sponsorisé, sponsorisés | .s-result-item:has(.s-widget-sponsored-label-text), .AdHolder, #sp_detail | all
Pagination | pagination, pages, next page, page suivante | .s-pagination-container | one
Buy box | buy box, add to cart, ajouter au panier, buy now, acheter | #desktop_buybox ; #buybox | one
Product bullets | about this item, bullets, à propos de cet article, description | #feature-bullets | one
Customer reviews | customer reviews, avis clients, commentaires clients | #customerReviews | one
Footer | footer, pied de page | #navFooter | one
```
