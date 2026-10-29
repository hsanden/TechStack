import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect, extractMeta, extractUrls, isChallengePage } from '../src/detect.js';

const names = (page) => detect({ html: '', headers: {}, cookies: [], urls: [], ...page }).map((t) => t.name);

test('Shopify via CDN-URL och header', () => {
  assert.ok(names({ urls: ['https://cdn.shopify.com/s/files/1/theme.js'] }).includes('Shopify'));
  assert.ok(names({ headers: { 'x-shopid': '123' } }).includes('Shopify'));
});

test('WooCommerce medför WordPress', () => {
  const found = detect({ html: '', headers: {}, cookies: ['wp_woocommerce_session_abc'], urls: [] });
  const wp = found.find((t) => t.name === 'WordPress');
  assert.ok(found.some((t) => t.name === 'WooCommerce'));
  assert.deepEqual(wp.evidence, ['följer av WooCommerce']);
});

test('Salesforce Commerce Cloud via cookie', () => {
  assert.ok(names({ cookies: ['dwanonymous_abc123'] }).includes('Salesforce Commerce Cloud'));
});

test('Magento via x-magento-init', () => {
  assert.ok(names({ html: '<script type="text/x-magento-init">{}</script>' }).includes('Magento'));
});

test('nordiska plattformar', () => {
  assert.ok(names({ urls: ['https://shop.cdn-norce.tech/img.jpg'] }).includes('Norce'));
  assert.ok(names({ urls: ['https://brand.centracdn.net/client/dynamic/images/a.jpg'] }).includes('Centra'));
  assert.ok(names({ html: 'window.__litium = window.__litium || {}' }).includes('Litium'));
  assert.ok(names({ urls: ['https://hooks.storeapi.jetshop.io/'] }).includes('Jetshop'));
});

test('Optimizely via globalassets', () => {
  assert.ok(names({ html: '<img src="/globalassets/bilder/hero.jpg">' }).includes('Optimizely'));
});

test('ingen falsk träff på produktbilder från Abicart eller Font Awesome-ikon', () => {
  const found = names({
    urls: ['https://cdn.abicart.com/shop/31923/art23/123.jpg'],
    html: '.fa-shopware{--fa:"\\f5b5"}',
  });
  assert.ok(!found.includes('Abicart'));
  assert.ok(!found.includes('Shopware'));
});

test('Next.js medför React, och Cloudflare via header', () => {
  const found = names({ html: '<script id="__NEXT_DATA__">', headers: { 'cf-ray': 'abc-ARN' } });
  assert.ok(found.includes('Next.js') && found.includes('React') && found.includes('Cloudflare'));
});

test('resultatet sorteras med plattform först', () => {
  const found = detect({ html: 'klarna', headers: {}, cookies: [], urls: ['https://cdn.shopify.com/a.js'] });
  assert.equal(found[0].category, 'platform');
});

test('extractUrls och extractMeta', () => {
  const html = '<script src="/a.js"></script><img data-src="//cdn.x.se/b.png"><meta name="generator" content="WordPress 6.6">';
  assert.deepEqual(extractUrls(html, 'https://www.ex.se/'), ['https://www.ex.se/a.js', 'https://cdn.x.se/b.png']);
  assert.equal(extractMeta(html).generator, 'WordPress 6.6');
  assert.ok(names({ html }).includes('WordPress'));
});

test('känner igen botskydd', () => {
  assert.ok(isChallengePage(403, '<title>Just a moment...</title>'));
  assert.ok(!isChallengePage(200, '<title>Just a moment...</title>'));
});
