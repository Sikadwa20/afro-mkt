import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const window = {};
vm.runInNewContext(readFileSync('marketplace-search.js','utf8'),{window});
const { rankProducts, groupSellers } = window.AFRO_MKT_SEARCH;
const products = [
  {id:'cake',seller_id:'a',seller_name:'Celebration Kitchen',name:'Cake',description:'Fresh cakes for birthday celebrations and family gatherings.',category:'Food & Drinks'},
  {id:'stew',seller_id:'b',seller_name:'Lagos Kitchen',name:'Eba with Egusi',description:'Freshly cooked cassava eba and egusi soup.',category:'Food & Drinks'},
  {id:'rice',seller_id:'b',seller_name:'Lagos Kitchen',name:'Jollof rice',description:'Rice with tomatoes and herbs.',category:'Food & Drinks'},
  {id:'cake2',seller_id:'c',seller_name:'Sweet Shop',name:'Birthday cake',description:'Freshly baked.',category:'Food & Drinks'}
];
test('birthday cake matches name and description and ranks exact names first',()=>{
  const matches=rankProducts(products,'birthday cake');
  assert.equal(matches.length,2); assert.equal(matches[0].product.id,'cake2'); assert.equal(matches[1].product.id,'cake');
});
test('eguzi spelling, stop words and accents find actual matching food',()=>{
  assert.equal(rankProducts(products,'eba with eguzi')[0].product.id,'stew');
  assert.equal(rankProducts(products,'éba com egusi')[0].product.id,'stew');
  assert.equal(rankProducts(products,'bolo de aniversário').length,2);
});
test('seller name and a minor typing error can find a store',()=>{
  assert.equal(rankProducts(products,'Lagos Kitchen').length,2);
  assert.equal(rankProducts(products,'birthay cake').length,2);
});
test('store names match joined words and ampersand variations without unrelated matches',()=>{
  const fixtures=[{id:'one',seller_id:'a',seller_name:'A&b delight',name:'Cake'}, {id:'two',seller_id:'a',seller_name:'A&b delight',name:'Waakye'}, {id:'three',seller_id:'b',seller_name:'Other store',name:'Cake'}];
  for (const query of ['abdelight','AB Delight','A&B Delight','A and B Delight','abdel']) {
    assert.deepEqual(Array.from(rankProducts(fixtures,query),x=>x.product.id),['one','two']);
  }
  assert.equal(rankProducts(fixtures,'abdelight shoes').length,0);
});
test('all meaningful terms must match; unavailable items do not invent suggestions',()=>{
  assert.equal(rankProducts(products,'eba birthday').length,0);
  assert.equal(rankProducts(products,'waakye').length,0);
});
test('seller groups use real matching listings and relevance; duplicate names do not merge owners',()=>{
  const groups=groupSellers(rankProducts(products,'birthday cake'));
  assert.equal(groups.length,2); assert.equal(groups[0].id,'c'); assert.equal(groups[1].id,'a');
  const shops=groupSellers(rankProducts(products,'Lagos'));
  assert.equal(shops.length,1); assert.equal(shops[0].products.length,2);
  const sameName=groupSellers(rankProducts(products.map(p=>({...p,seller_name:'Same name'})),''));
  assert.equal(sameName.length,3);
});
test('clearing search restores the original order and punctuation remains plain text',()=>{
  assert.equal(rankProducts(products,'').map(item=>item.product.id).join(','),'cake,stew,rice,cake2');
  assert.equal(rankProducts(products,'<script>alert(1)</script>').length,0);
});

test('store pages include all published products from the selected owner and keep prices',()=>{
  const owned=window.AFRO_MKT_SEARCH.getStoreProducts(products,'b');
  assert.equal(owned.length,2); assert.equal(owned.map(p=>p.id).join(','),'stew,rice');
  const priced=window.AFRO_MKT_SEARCH.getStoreProducts(products.map(p=>({...p,price:20})), 'a');
  assert.equal(priced[0].price,20);
});
test('store identity never merges equal seller names or includes inactive and pending listings',()=>{
  const fixtures=products.map(p=>({...p,seller_name:'Same name'})).concat([
    {...products[0],id:'pending',is_approved:false}, {...products[0],id:'inactive',is_active:false}
  ]);
  assert.equal(window.AFRO_MKT_SEARCH.getStoreProducts(fixtures,'a').length,1);
  assert.equal(window.AFRO_MKT_SEARCH.getStoreProducts(fixtures,'unknown').length,0);
});
test('older store links can resolve through a published product without exposing email in the URL',()=>{
  const fixtures=[{id:'one',seller_email:'one@example.test'},{id:'two',seller_email:'one@example.test'},{id:'three',seller_email:'other@example.test'}];
  assert.equal(window.AFRO_MKT_SEARCH.getStoreProducts(fixtures,'two').length,2);
});
