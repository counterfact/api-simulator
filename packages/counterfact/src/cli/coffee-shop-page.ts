import { coffeeShopAction } from "./coffee-shop-action.js";
import { CoffeeShopProgress } from "./coffee-shop-progress.js";

import { COUNTERFACT_LOGO } from "./counterfact-logo.js";

import { basename } from "node:path";

export function coffeeShopPage(projectPath: string): string {
  const path = JSON.stringify(projectPath).replace(/</gu, "\\u003c");
  const editorUrl = new URL("vscode://file/");
  const editorPath = projectPath.replace(/\\/gu, "/");
  editorUrl.pathname = `${editorPath.startsWith("/") ? "" : "/"}${editorPath}/`;
  const name = basename(projectPath);
  const restart = JSON.stringify(
    `npx counterfact ./${name}/openapi.json ./${name}`,
  ).replace(/</gu, "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Counterfact Coffee · Guided example</title>
<style>
:root{--paper:#fafafa;--surface:#fff;--ink:#17202a;--muted:#536170;--rule:#dce2e8;--blue:#0869a6;--blue-dark:#04517f;--orange:#f58e00;--orange-dark:#a24b00;--code:#f1f4f6;font-family:system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--paper);font-size:16px}*{box-sizing:border-box}body{margin:0}button{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:11px 16px;background:var(--blue);color:white;font-weight:650}button:hover:not(:disabled){background:var(--blue-dark)}button.secondary:hover:not(:disabled){background:#dce9f3}button:disabled{background:#e5eaf0;color:var(--muted);cursor:not-allowed}button.secondary{background:#edf3f8;color:var(--ink)}button:focus-visible,a:focus-visible{outline:3px solid var(--orange-dark);outline-offset:3px}a{color:var(--blue)}.brand{margin-bottom:24px}.counterfact-logo{display:block;width:240px;max-width:100%;height:auto;margin-bottom:14px}.layout{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));min-width:1100px;min-height:100vh}.guide{min-width:0;padding:36px;background:#fff;border-right:1px solid var(--rule)}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--muted)}h1{font-family:Georgia,serif;font-size:36px;margin:8px 0 10px}h2{font-size:25px;line-height:1.2}h3{margin:0 0 8px}p{line-height:1.6}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--code);padding:14px;border-radius:8px;font-size:13px;line-height:1.5}.path{font-size:12px;overflow-wrap:anywhere;color:var(--muted)}.shop{min-width:0;padding:36px;width:100%;align-self:start}.shop-head{display:flex;justify-content:space-between;gap:20px;align-items:center}.demo{font-size:13px;color:var(--muted)}.products{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin:28px 0}.card{background:#fff;border:1px solid var(--rule);border-radius:14px;padding:20px;display:flex;flex-direction:column}.bag{height:145px;display:grid;place-items:center;margin-bottom:20px;background:#e3f0f9;border-radius:8px}.bag.dark-roast{background:#dce7f0}.bag.decaf{background:#fff0d9}.bag-label{background:#fff;border:1px solid var(--rule);padding:22px 14px;text-align:center;box-shadow:5px 5px 0 #0001;font-family:Georgia,serif;font-size:22px}.card p{font-size:14px;flex:1;color:var(--muted)}.stock{font-size:14px;margin:14px 0;color:var(--muted);font-weight:600}.price{font-weight:700}.cart{background:white;border:1px solid var(--rule);border-radius:14px;padding:24px}.cart-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--rule)}.cart-row button{padding:5px 10px}.cart-footer{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:22px}.notice{padding:16px;background:#eaf5fb;border-radius:8px;margin:18px 0}.error{background:#fff0e7;color:#8c351c}.file-actions{display:flex;align-items:center;gap:12px;margin:12px 0;font-size:12px}.file-actions button{font-size:12px;padding:6px 10px}.code-hint{margin:18px 0}.code-hint summary{cursor:pointer;font-weight:650}.controls{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.controls button{font-size:13px}#guide-status{font-size:14px;color:var(--muted);border-left:2px solid var(--rule);padding:4px 0 4px 12px;margin:18px 0}#guide-status::before{content:"Update";display:block;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);margin-bottom:4px}#guide-status:empty{display:none}
</style></head><body><main class="layout">
<aside class="guide" aria-label="Walkthrough instructions"><div class="brand">${COUNTERFACT_LOGO}<div class="eyebrow">Learn by doing</div></div><div id="lesson"></div><p id="guide-status" role="status" aria-live="polite"></p><div id="save-check" role="status" aria-live="polite"></div><div class="controls"><button id="continue" hidden>Continue</button><button id="back" class="secondary" hidden>Back</button><button id="skip" class="secondary">Skip lesson</button></div></aside>
<section class="shop" aria-label="Coffee shop"><header class="shop-head"><div><div class="eyebrow">Small batch · Big comfort</div><h1>Counterfact Coffee</h1><div class="demo">A local demo shop. No payments or real orders.</div></div></header><div id="shop-notice" role="status" aria-live="polite"></div><div id="products" class="products"></div><section class="cart" aria-label="Shopping cart"><h2>Your cart</h2><div id="cart"></div><div class="cart-footer"><strong id="total"></strong><button id="checkout" disabled>Place order</button></div></section></section>
</main><script>
const projectPath = ${path};
const projectEditorUrl = ${JSON.stringify(editorUrl.href)};
const restartCommand = ${restart};
let sessionId, displayedPhase, displayedRecovery, pendingPurchase;
let savedRevision, saveCheckRequest, checkedLesson, passedSaveCheck=false, saveCheckDirty=false;
${CoffeeShopProgress.toString()}
${coffeeShopAction.toString()}
const progress = new CoffeeShopProgress();
const $ = (id) => document.getElementById(id);
const money = (cents) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents / 100);
let products = [], cart = {}, busy = false, refreshRequest, inventoryFresh=false, lastFailure, productError=false;
function element(tag,text,className){const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;}
function notice(text,error=false){$('shop-notice').replaceChildren(element('p',text,'notice'+(error?' error':'')));}
async function requestJson(path,options={}){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),4000);
  try{const response=await fetch(path,{...options,signal:controller.signal});const result=await response.json();return {response,result};}finally{clearTimeout(timeout);}
}
function validProducts(value){
  const ids=['house-blend','dark-roast','decaf'];return Array.isArray(value)&&value.length===3&&new Set(value.map(p=>p?.id)).size===3&&value.every(p=>p&&ids.includes(p.id)&&typeof p.name==='string'&&typeof p.description==='string'&&Number.isSafeInteger(p.price)&&p.price>=0&&Number.isSafeInteger(p.stock)&&p.stock>=0);
}
function renderOrderFailure(){
  if(!lastFailure)return;const {status,result,items}=lastFailure;let text;
  if(status===503&&lastFailure.resolved){notice('Ordering is available again. Retry your order; your cart is ready.');return;}
  if(status===undefined)text='Order confirmation unavailable. The request may have been accepted; check the inventory before retrying. Your cart has been kept.';
  else if(status===409){
    const shortages=Array.isArray(result?.shortages)?result.shortages.filter(s=>s&&items.some(i=>i.productId===s.productId)&&Number.isSafeInteger(s.requested)&&s.requested>0&&Number.isSafeInteger(s.available)&&s.available>=0):[];
    text=shortages.length?shortages.map(s=>productName(s.productId)+': your cart requested '+s.requested+'; the order API reported '+s.available+' available.').join(' '):'The API rejected the order because it could not fulfill the cart. Compare the cart with the latest reported inventory.';
    text+=' Your cart has been kept. Reduce its quantity or restock in Counterfact, then try again.';
  }else text=(typeof result?.error==='string'?result.error:'Order rejected (HTTP '+status+').')+' Your cart has been kept; restore ordering and try again.';
  notice(text,true);
}
function stockSnapshot(){return Object.fromEntries(products.map(p=>[p.id,p.stock]));}
function productName(id){return products.find(p=>p.id===id)?.name||id;}
function reportPurchase(){
  if(!pendingPurchase)return;const {items,before,phase}=pendingPurchase;pendingPurchase=undefined;
  const after=stockSnapshot();const observed=items.filter(item=>before[item.productId]!==undefined&&after[item.productId]!==undefined);
  if(!observed.length)return;
  const unchanged=observed.every(item=>before[item.productId]===after[item.productId]);
  const text=observed.map(item=>productName(item.productId)+' API stock '+(before[item.productId]===after[item.productId]?'stayed at '+after[item.productId]:before[item.productId]+' → '+after[item.productId]+' after checkout')).join('; ');
  const explanation=phase===1&&unchanged?'The order succeeded, but the starter API has not reduced stock. '+text+'. We’ll add that behavior shortly.':'Order confirmed. '+text+'.';
  const next=phase===6&&progress.step===7&&!progress.done&&!progress.inventoryUpdated?' Now add the inventory update.':phase===4&&!progress.done?' Save ordersAvailable = false, then try another order.':'';
  $('guide-status').textContent=explanation+next;
}
function renderProducts(){
  $('products').replaceChildren();
  for(const product of products){
    const card=element('article','', 'card');card.dataset.productId=product.id;
    const bag=element('div','','bag '+product.id);bag.append(element('div',product.name,'bag-label'));card.append(bag,element('h3',product.name),element('p',product.description),element('div',money(product.price)+' / 250g','price'));
    const inCart=cart[product.id]||0;const available=Math.max(0,product.stock-inCart);
    const availability=!inventoryFresh?'Availability temporarily unavailable':product.stock===0?'Sold out':available===0?'All remaining bags are in your cart':available+(inCart?' more':'')+(available===1?' bag available':' bags available');
    card.append(element('div',availability,'stock'));
    const add=element('button','Add to cart');add.disabled=busy||!inventoryFresh||available===0;add.onclick=()=>{cart[product.id]=(cart[product.id]||0)+1;lastFailure=undefined;$('shop-notice').replaceChildren();renderProducts();renderCart();onCart();};card.append(add);$('products').append(card);
  }
}
function renderCart(){
  saveProgress();
  $('cart').replaceChildren();let total=0;
  for(const [id,quantity] of Object.entries(cart)){
    const product=products.find(p=>p.id===id);if(!product)continue;total+=product.price*quantity;
    const row=element('div','','cart-row');row.append(element('span',product.name+' × '+quantity));const quantities=element('span');for(const [label,delta] of [['−',-1],['+',1]]){const button=element('button',label,'secondary');button.setAttribute('aria-label',(delta<0?'Decrease ':'Increase ')+product.name+' quantity');button.disabled=busy||(delta>0&&(!inventoryFresh||quantity>=product.stock));button.onclick=()=>{lastFailure=undefined;$('shop-notice').replaceChildren();const next=quantity+delta;if(next===0)delete cart[id];else cart[id]=next;renderProducts();renderCart();onCart();};quantities.append(button);}row.append(quantities);const remove=element('button','Remove','secondary');remove.disabled=busy;remove.onclick=()=>{lastFailure=undefined;$('shop-notice').replaceChildren();delete cart[id];renderProducts();renderCart();onCart();};row.append(remove);$('cart').append(row);
  }
  if(!Object.keys(cart).length)$('cart').append(element('p','Your cart is empty. Choose a coffee above.'));
  $('total').textContent=money(total);$('checkout').textContent=lastFailure||(progress.step===5&&!progress.done&&progress.failedItems)?'Try again':'Place order';$('checkout').disabled=busy||!inventoryFresh||!Object.keys(cart).length;
}
async function refreshProducts({source='manual',credit=true}={}){
  if(refreshRequest)return refreshRequest;
  refreshRequest=(async()=>{
    try{
      const {response,result:next}=await requestJson('/products');if(!response.ok||!validProducts(next))throw Error('Invalid product response');
      const recovered=!inventoryFresh;inventoryFresh=true;const changed=JSON.stringify(products)!==JSON.stringify(next);products=next;
      if(changed||recovered||source!=='live'){renderProducts();renderCart();if(credit)onProducts();}
      else if(credit&&(progress.step!==2||passedSaveCheck)){const wasDone=progress.done;progress.products(stockSnapshot());if(wasDone!==progress.done)checkProgress();}
      if(productError){productError=false;$('shop-notice').replaceChildren();if(!progress.done){$('guide-status').textContent='API connection restored. Continue the experiment.';updateAction();}}renderOrderFailure();if(source!=='before-order')reportPurchase();
      return true;
    }catch(error){inventoryFresh=false;productError=true;renderProducts();renderCart();notice('Current inventory could not be verified. Your cart has been kept. Check Counterfact; the shop will reconnect automatically.',true);$('guide-status').textContent='Waiting for a valid products response. Displayed inventory is last known, not current.';return false;}
  })();
  try{return await refreshRequest;}finally{refreshRequest=undefined;}
}
async function placeOrder(){
  if(busy||!Object.keys(cart).length)return;pendingPurchase=undefined;busy=true;renderProducts();renderCart();
  if(!await refreshProducts({source:'before-order',credit:false})){busy=false;renderProducts();renderCart();return;}
  const items=Object.entries(cart).map(([productId,quantity])=>({productId,quantity}));const before=stockSnapshot(),phase=progress.step;
  try{const {response,result}=await requestJson('/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});if(response.ok&&(response.status!==201||!Number.isInteger(result?.orderId)))throw Error('Invalid order confirmation');if(!response.ok){lastFailure={status:response.status,result,items};renderOrderFailure();$('checkout').textContent='Try again';onOrder(false,items,response.status);return;}pendingPurchase={items,before,phase};lastFailure=undefined;cart={};notice('Thanks! Demo order #'+result.orderId+' is confirmed.');$('checkout').textContent='Place order';renderProducts();onOrder(true,items,response.status);}
  catch(error){lastFailure={status:undefined,result:undefined,items};renderOrderFailure();$('checkout').textContent='Try again';$('guide-status').textContent='The order request could not be completed. Check Counterfact and retry.';}
  finally{await refreshProducts({source:'after-order'});busy=false;renderProducts();renderCart();}
}
const lessons = [
  ['Your local coffee shop is running','Change your local API’s behavior and see this app respond—without restarting Counterfact. Click Start shopping to make a purchase. Keep Counterfact running in your terminal.'],
  ['Buy a bag of House Blend','Add House Blend to your cart, then place an order. No payment is needed.'],
  ['Make Decaf available','Decaf is sold out. Open routes/products.ts in your editor. Change its starting stock from 0 to 5, save, and watch the inventory. This starter handler applies a changed starting quantity once; later requests read the running inventory. Five is the guided example; another positive whole-number quantity works too.','const decafStock = 0;','const decafStock = 5;','routes/products.ts'],
  ['Make Decaf available','Add Decaf to the cart and place an order. Your API change made this purchase possible.'],
  ['Test order failure and recovery','Add a coffee to your cart. Open routes/orders.ts, change ordersAvailable to false, and save. Then click Place order.','const ordersAvailable = true;','const ordersAvailable = false;','routes/orders.ts'],
  ['Test order failure and recovery','In the same file, restore ordersAvailable to true and save. Click Try again. Your cart is still there.','const ordersAvailable = false;','const ordersAvailable = true;','routes/orders.ts'],
  ['Make purchases reduce inventory','Add one Dark Roast to your cart, place an order, then watch the inventory. Compare the inventory before and after the purchase. Does accepting an order also subtract stock?'],
  ['Make purchases reduce inventory','Products read shared context. Open routes/_.context.ts to see inventory, then open routes/orders.ts. Add these lines at the INVENTORY LESSON comment, save. Add one Dark Roast to your cart, place an order, and watch the inventory.','', 'for (const item of items) {\\n  $.context.inventory[item.productId] -= item.quantity;\\n}', 'routes/orders.ts'],
  ['Watch Dark Roast sell out','Add the remaining Dark Roast bags to your cart and place an order. Then watch the inventory. Watch what happens to the final bag and the Add to cart button.'],
  ['Restock through the REPL and buy a bag','Switch to Counterfact’s terminal. Its ⬣> prompt is the REPL: you can inspect and change the running context. Inspect the inventory with the first command. Restock it with the second command, then return here and watch the inventory. Five is an example; another positive whole-number quantity works too.','context.inventory["dark-roast"]','context.inventory["dark-roast"] = 5'],
  ['Restock through the REPL and buy a bag','Add one Dark Roast to your cart, place an order, then watch the inventory. One bag is the guided example; you may buy another quantity. Compare the restocked inventory with the quantity purchased to verify the REPL and order handler share the same object.'],
  ['You changed a shopping workflow','You made a product available, tested failure and recovery, updated context in a handler, and restocked it through the REPL. The app and Counterfact are still running. You can use the same workflow with your own API: locate a handler, change its response or shared context, exercise the client, and verify the result.'],
];
const successes = {
  1:'The order succeeded, but the starter API has not reduced stock. We’ll add that behavior shortly.',
  2:'Decaf is available. Your saved change reached the API without a restart.',
  3:'You changed what a shopper could buy.',
  4:'The order failed, and the shop kept your cart so you can retry.',
  5:'The retry worked with the same cart.',
  6:'The stock stayed the same. Next, connect orders to the shared inventory.',
  7:'The order updated context; the product request returned the lower stock.',
  8:'Dark Roast sold out. The shop reacted to inventory reaching zero.',
  9:'Dark Roast is back in stock. The product handler read your updated context.',
  10:'The purchased quantity was subtracted from the inventory you restocked. The REPL and order handler share the same inventory.',
};
function currentRecovery(){
  if(progress.done||!inventoryFresh)return;
  const id=progress.step===1?'house-blend':[2,3].includes(progress.step)?'decaf':[6,7,8].includes(progress.step)?'dark-roast':undefined;
  if(!id||(progress.step===2&&!passedSaveCheck))return;
  const stock=products.find(product=>product.id===id)?.stock;
  if(stock===undefined||stock>0)return;
  return {id,stock,name:productName(id),command:'context.inventory["'+id+'"] = 5'};
}
function currentAction(){const recovery=currentRecovery();if(recovery)return {text:'Restock '+recovery.name+' through Counterfact’s REPL'};return coffeeShopAction({step:progress.step,done:progress.done,cart,stock:Object.fromEntries(products.map(p=>[p.id,p.stock])),ordered:!!progress.lastOrder,editVerified:passedSaveCheck,inventoryUpdated:progress.inventoryUpdated});}
const instructionFiles=['routes/_.context.ts','routes/products.ts','routes/orders.ts','scenarios/index.ts','openapi.json'];
function fileLink(file,label=file){const link=element('a',label);link.href=new URL(file,projectEditorUrl).href;link.title='Open in VSCode';return link;}
function fileText(tag,text,className){
  const node=element(tag,'',className);
  while(text){
    const match=instructionFiles.map(file=>({file,index:text.indexOf(file)})).filter(match=>match.index>=0).sort((a,b)=>a.index-b.index||b.file.length-a.file.length)[0];
    if(!match){node.append(element('span',text));break;}
    if(match.index)node.append(element('span',text.slice(0,match.index)));
    node.append(fileLink(match.file));text=text.slice(match.index+match.file.length);
  }
  return node;
}
function instructionParagraph(text){
  const paragraph=element('p','');paragraph.id='instruction-text';const action=currentAction();const start=action?text.toLowerCase().indexOf(action.text.toLowerCase()):-1;
  if(start<0){paragraph.append(fileText('span',text));return paragraph;}
  paragraph.append(fileText('span',text.slice(0,start)),fileText('strong',text.slice(start,start+action.text.length)),fileText('span',text.slice(start+action.text.length)));return paragraph;
}
function updateAction(){
  const paragraph=$('instruction-text');if(paragraph)paragraph.replaceWith(instructionParagraph(paragraph.textContent));

}
function showLesson(){
  if(displayedPhase!==progress.step&&!lastFailure)$('shop-notice').replaceChildren();
  displayedPhase=progress.step;
  if(checkedLesson!==progress.step){passedSaveCheck=false;$('save-check').replaceChildren();}
  if(progress.done&&passedSaveCheck)$('save-check').replaceChildren();
  saveProgress();
  const lesson=[...lessons[progress.step]];
  const recovery=currentRecovery();displayedRecovery=recovery?.id;
  if(recovery){lesson[1]=recovery.name+' has '+recovery.stock+' bags in your running shop. Back keeps your files and inventory. Restock '+recovery.name+' through Counterfact’s REPL, then continue this exercise.';lesson[2]='';lesson[3]='';lesson[4]='';}

  if(!recovery&&progress.step===7&&progress.inventoryUpdated&&!progress.done){lesson[1]='Your order handler already updates inventory. You do not need to add the lines again. Add one Dark Roast to your cart, place an order, and watch the inventory to verify the shared state.';lesson[2]='';lesson[3]='';}$('lesson').replaceChildren(element('div','Step '+(progress.lessonIndex+1)+' of 8','eyebrow'),fileText('h2',lesson[0]),instructionParagraph(lesson[1]));
  if(lesson[4]){const actions=element('div','','file-actions');actions.append(fileLink(lesson[4],'Open in VSCode'));const copy=element('button','Copy file path','secondary');copy.onclick=()=>copyPath(projectPath+'/'+lesson[4],copy);actions.append(copy);$('lesson').append(actions);}
  if(recovery)$('lesson').append(element('pre',recovery.command));
  if(lesson[4]||lesson[2]||lesson[3]){
    const hint=element(progress.step===9?'div':'details','','code-hint');if(progress.step!==9)hint.append(element('summary','Show code hint'));
    if(lesson[4]){const path=element('p','','path');path.append(fileLink(lesson[4],projectPath+'/'+lesson[4]));hint.append(path);}
    if(lesson[2])hint.append(element('p',progress.step===9?'Read the current quantity:':'Find:'),fileText('pre',lesson[2]));
    if(lesson[3])hint.append(element('p',progress.step===9?'Then update it:':progress.step===7?'Add:':'Change to:'),fileText('pre',lesson[3]));
    $('lesson').append(hint);
  }
  if(progress.step===11){$('lesson').append(element('p','Try it without a hint: choose another coffee, make it unavailable, verify the shopper’s experience, then restore it. This optional challenge is yours to explore.'),element('p','To restart this project, run:'),fileText('pre',restartCommand));const link=element('a','Continue learning');link.href='https://counterfact.dev/docs/first-10-minutes/';$('lesson').append(link);}
  if(progress.done&&progress.step<11){const next=element('p','');next.append(element('strong','Click Continue'),element('span',' to move to the next lesson.'));$('lesson').append(next);}
  $('guide-status').textContent=progress.done?(progress.step===6&&progress.inventoryUpdated?'Your saved order handler already reduces stock. Continue to verify the shared inventory.':successes[progress.step]):'';
  $('continue').hidden=!(progress.done||progress.step===0);$('continue').textContent=progress.step===0?'Start shopping':'Continue';$('back').hidden=progress.step===0;$('skip').hidden=progress.step===11;updateAction();
}
function checkProgress(){
  if(progress.done&&[2,4,6,9].includes(progress.step)){
    const phase=progress.step;progress.next();showLesson();
    const transitions={2:'Decaf is available. Now buy a bag to try your change.',4:'The order failed and your cart is still here. Restore ordering, then retry.',6:progress.inventoryUpdated?'Your handler already reduces stock. Make one more purchase to verify it.':'The order succeeded, but stock stayed the same. Now add the inventory update.',9:'Dark Roast is available. Buy a bag to check the shared inventory.'};
    $('guide-status').textContent=transitions[phase];
  }else if(progress.done||displayedRecovery!==currentRecovery()?.id)showLesson();else updateAction();
}
function onCart(){if(!progress.done)$('guide-status').textContent='';updateAction();if(progress.step===1&&cart['house-blend'])$('guide-status').textContent='Your cart is ready. Click Place order.';if(progress.step===3&&cart.decaf)$('guide-status').textContent='Decaf is in your cart. Click Place order.';}
function onProducts(){
  if(progress.step===2&&!passedSaveCheck)return;
  progress.products(Object.fromEntries(products.map(product=>[product.id,product.stock])));checkProgress();
  if(!progress.done&&progress.step===2)$('guide-status').textContent='Decaf is still unavailable. Check the displayed file, save your change, then watch for the product response.';
  if(!progress.done&&[7,8].includes(progress.step)&&progress.lastOrder)$('guide-status').textContent='The inventory has not decreased as expected. Check that your new lines are in the successful-order section, save, buy another bag, and watch its effect.';
}
function onOrder(success,items,status){
  progress.order(success,items,products.find(product=>product.id==='dark-roast')?.stock||0,status);checkProgress();
  if(success&&[6,7,8,10].includes(progress.step)&&!progress.done)$('guide-status').textContent='The order went through. Watching for the product response to show the inventory.';
  if(success&&progress.step===4)$('guide-status').textContent='This order succeeded. Save ordersAvailable = false, add another coffee, and try again.';
}
$('checkout').onclick=placeOrder;
$('continue').onclick=()=>{progress.next();showLesson();refreshProducts({source:'lesson'});};$('back').onclick=()=>{progress.back();showLesson();refreshProducts({source:'lesson'});};$('skip').onclick=()=>{progress.skip();showLesson();refreshProducts({source:'lesson'});};
async function copyPath(path,button){try{await navigator.clipboard.writeText(path);button.textContent='Copied';}catch{$('guide-status').textContent='Select and copy the path shown in the instructions.';}}
function saveProgress(){if(!sessionId)return;try{sessionStorage.setItem('counterfact-coffee',JSON.stringify({sessionId,progress,cart}));}catch{}}
async function checkSavedFiles(){
  if(saveCheckRequest)return saveCheckRequest;
  saveCheckRequest=(async()=>{
    try{
      const {response,result:info}=await requestJson('/tutorial-info');
      if(!response.ok||typeof info.revision!=='string')return;
      const changed=savedRevision!==undefined&&savedRevision!==info.revision;
      const lessonChanged=checkedLesson!==progress.step;
      if(!changed&&!lessonChanged)return;
      if(lessonChanged&&checkedLesson!==undefined)saveCheckDirty=false;
      if(changed)saveCheckDirty=true;
      savedRevision=info.revision;checkedLesson=progress.step;
      if(![2,4,5,7].includes(progress.step))return;
      const step=progress.step, revision=info.revision;
      if(changed){passedSaveCheck=false;$('save-check').replaceChildren(element('p','File saved. Checking the handler…','notice'));}
      const {response:checked,result}=await requestJson('/tutorial-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({step})});
      if(!checked.ok||typeof result?.revision!=='string'||typeof result.ok!=='boolean'||typeof result.message!=='string')throw Error('The check returned an invalid response.');
      const {result:latest}=await requestJson('/tutorial-info');
      if(progress.step!==step||latest.revision!==revision||result.revision!==revision){savedRevision=undefined;checkedLesson=undefined;return;}
      passedSaveCheck=result.ok;
      if(!result.ok){progress.lastOrder=undefined;if(changed&&progress.done){progress.done=false;progress.lastOrder=undefined;showLesson();}updateAction();}
      if(result.ok||saveCheckDirty){const panel=$('save-check');panel.setAttribute('role',result.ok?'status':'alert');panel.replaceChildren(element('p',result.message+(result.ok?(progress.done?'':step===7?' Now place an order to see the inventory decrease.':step===5?' Now retry your order.':' Now try it in the shop.'):' Fix the file and save again; it will be checked automatically.'),'notice'+(result.ok?'':' error')));}
      saveCheckDirty=false;
      if(step===5&&lastFailure?.status===503){lastFailure.resolved=result.ok;renderOrderFailure();}
      if(result.ok){$('guide-status').textContent='';checkProgress();saveProgress();await refreshProducts({source:'saved-file'});}
    }catch{savedRevision=undefined;checkedLesson=undefined;$('save-check').setAttribute('role','alert');$('save-check').replaceChildren(element('p','The saved handler could not be checked. Check Counterfact’s terminal for errors; the walkthrough will retry automatically.','notice error'));}
  })();
  try{return await saveCheckRequest;}finally{saveCheckRequest=undefined;}
}
async function pollWalkthrough(){if(busy||document.hidden)return;await checkSavedFiles();await refreshProducts({source:'live'});}
async function startWalkthrough(){
  try{
    const {response,result:info}=await requestJson('/tutorial-info');if(!response.ok)throw Error('Project information unavailable');sessionId=info.sessionId;
    const saved=JSON.parse(sessionStorage.getItem('counterfact-coffee')||'null');
    if(saved&&saved.sessionId===sessionId&&saved.progress&&Number.isInteger(saved.progress.step)&&saved.progress.step>=0&&saved.progress.step<=11){
      progress.step=saved.progress.step;progress.done=saved.progress.done===true;progress.inventoryUpdated=saved.progress.inventoryUpdated===true;
      if(typeof saved.progress.failedItems==='string')progress.failedItems=saved.progress.failedItems;
      const previous=saved.progress.lastOrder;
      if(previous&&Number.isInteger(previous.stock)&&Array.isArray(previous.items)&&previous.items.every(item=>['house-blend','dark-roast','decaf'].includes(item.productId)&&Number.isSafeInteger(item.quantity)&&item.quantity>0))progress.lastOrder=previous;
      if(saved.cart&&typeof saved.cart==='object')cart=Object.fromEntries(Object.entries(saved.cart).filter(([id,quantity])=>['house-blend','dark-roast','decaf'].includes(id)&&Number.isSafeInteger(quantity)&&quantity>0));
    }
  }catch{ /* A missing or corrupt saved lesson starts a fresh browser lesson. */ }
  showLesson();renderCart();await checkSavedFiles();await refreshProducts();if([1,3].includes(progress.step)&&Object.keys(cart).length)onCart();
}
const walkthroughReady=startWalkthrough();
setInterval(()=>pollWalkthrough(),1000);
window.addEventListener('focus',()=>pollWalkthrough());
</script></body></html>`;
}
