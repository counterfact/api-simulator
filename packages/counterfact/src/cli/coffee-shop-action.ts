export function coffeeShopAction({
  step,
  done,
  cart,
  stock,
  ordered,
  editVerified,
  inventoryUpdated,
}: {
  step: number;
  done: boolean;
  cart: Record<string, number>;
  stock: Record<string, number>;
  ordered: boolean;
  editVerified: boolean;
  inventoryUpdated: boolean;
}): { text: string } | undefined {
  if (done || step === 11) return;
  if (step === 0) return { text: "Click Start shopping" };
  const edits: Record<number, string> = {
    2: "Change its starting stock from 0 to 5, save",
    4: "change ordersAvailable to false, and save",
    5: "restore ordersAvailable to true and save",
    7: "Add these lines at the INVENTORY LESSON comment, save",
  };
  if (step === 9) return { text: "Restock it with the second command" };
  if (step === 4 && !Object.keys(cart).length)
    return { text: "Add a coffee to your cart" };
  const edit = edits[step];
  if (edit && !ordered && !editVerified && !(step === 7 && inventoryUpdated))
    return { text: edit };
  if (step === 2 || step === 9 || ordered)
    return { text: "watch the inventory" };
  if (step === 5) return { text: "Click Try again" };
  if (step === 4) return { text: "click Place order" };
  const product =
    step === 1 ? "house-blend" : step === 3 ? "decaf" : "dark-roast";
  const quantity = step === 8 ? stock[product] || 1 : 1;
  if ((cart[product] || 0) < quantity) {
    return {
      text:
        step === 1
          ? "Add House Blend to your cart"
          : step === 3
            ? "Add Decaf to the cart"
            : step === 8
              ? "Add the remaining Dark Roast bags to your cart"
              : "Add one Dark Roast to your cart",
    };
  }
  return { text: "place an order" };
}
