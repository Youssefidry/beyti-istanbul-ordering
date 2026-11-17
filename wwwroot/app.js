const byId = (id) => document.getElementById(id);
const menuView = byId("menu-view");
const trackingView = byId("tracking-view");
const cart = new Map();
let menuItems = [];
let selectedCategory = "الكل";

function showMessage(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

function hideMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeDishVisual(item, imageClass, fallbackClass) {
  if (!item.imageData) return makeElement("span", fallbackClass, item.emoji);
  const image = makeElement("img", imageClass);
  image.src = item.imageData;
  image.alt = item.name;
  image.loading = "lazy";
  image.addEventListener("error", () => {
    image.replaceWith(makeElement("span", fallbackClass, item.emoji));
  }, { once: true });
  return image;
}

function makeMoneyElement(value, tag = "span", className = "") {
  const element = makeElement(tag, `money${className ? ` ${className}` : ""}`);
  element.dir = "ltr";
  element.append(
    makeElement("span", "", new Intl.NumberFormat("ar-DZ").format(value)),
    makeElement("span", "", "درهم")
  );
  return element;
}

function setMoney(element, value) {
  element.replaceChildren(
    makeElement("span", "", new Intl.NumberFormat("ar-DZ").format(value)),
    makeElement("span", "", "درهم")
  );
}

function renderMenu() {
  const filters = byId("category-filters");
  const grid = byId("menu-grid");
  const categories = ["الكل", ...new Set(menuItems.map((item) => item.category))];
  filters.replaceChildren();

  categories.forEach((category) => {
    const button = makeElement("button", `filter-chip${category === selectedCategory ? " selected" : ""}`, category);
    button.type = "button";
    button.addEventListener("click", () => {
      selectedCategory = category;
      renderMenu();
    });
    filters.append(button);
  });

  grid.replaceChildren();
  menuItems
    .filter((item) => selectedCategory === "الكل" || item.category === selectedCategory)
    .forEach((item) => {
      const card = makeElement("article", "menu-card");
      const art = makeElement("div", "food-art");
      const ribbon = makeElement("span", "food-ribbon", item.category);
      if (item.imageData) art.classList.add("has-photo");
      art.append(ribbon, makeDishVisual(item, "food-photo", "food-emoji"));

      const meta = makeElement("div", "food-meta");
      const description = makeElement("div");
      description.append(makeElement("h3", "", item.name), makeElement("p", "", item.description));
      meta.append(description, makeMoneyElement(item.price, "span", "food-price"));

      const quantity = cart.get(item.id) ?? 0;
      const addButton = makeElement(
        "button",
        "add-button",
        quantity >= 10 ? "الحد الأقصى 10" : "أضف إلى الطلب  +"
      );
      addButton.type = "button";
      addButton.disabled = quantity >= 10;
      addButton.addEventListener("click", () => {
        cart.set(item.id, Math.min(10, (cart.get(item.id) ?? 0) + 1));
        renderMenu();
        renderCart();
      });
      card.append(art, meta, addButton);
      grid.append(card);
    });
}

function renderCart() {
  const container = byId("cart-items");
  const items = [...cart.entries()]
    .map(([id, quantity]) => ({ item: menuItems.find((menuItem) => menuItem.id === id), quantity }))
    .filter((entry) => entry.item);
  const count = items.reduce((sum, entry) => sum + entry.quantity, 0);
  const total = items.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0);
  byId("cart-count").textContent = new Intl.NumberFormat("ar-DZ").format(count);
  byId("cart-heading-count").textContent = `(${new Intl.NumberFormat("ar-DZ").format(count)})`;
  setMoney(byId("cart-total"), total);
  setMoney(byId("checkout-total"), total);
  byId("place-order").disabled = count === 0;
  byId("cart-toggle").classList.toggle("hidden", count === 0);

  if (items.length === 0) {
    const empty = makeElement("div", "empty-cart");
    empty.append(makeElement("span", "", "✳"), makeElement("p", "", "السلة بانتظار طبقك الأول."));
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren();
  items.forEach(({ item, quantity }) => {
    const row = makeElement("div", "cart-line");
    row.append(makeDishVisual(item, "cart-line-image", "cart-line-emoji"));
    const info = makeElement("div", "cart-line-info");
    info.append(makeElement("strong", "", item.name), makeMoneyElement(item.price * quantity));
    const controls = makeElement("div", "quantity-control");
    const decrement = makeElement("button", "", "−");
    decrement.type = "button";
    decrement.setAttribute("aria-label", `إنقاص كمية ${item.name}`);
    decrement.addEventListener("click", () => {
      if (quantity <= 1) cart.delete(item.id);
      else cart.set(item.id, quantity - 1);
      renderCart();
    });
    const quantityText = makeElement("span", "", new Intl.NumberFormat("ar-DZ").format(quantity));
    const increment = makeElement("button", "", "+");
    increment.type = "button";
    increment.setAttribute("aria-label", `زيادة كمية ${item.name}`);
    increment.addEventListener("click", () => {
      if (quantity < 10) cart.set(item.id, quantity + 1);
      renderCart();
    });
    controls.append(decrement, quantityText, increment);
    row.append(info, controls);
    container.append(row);
  });
}

function openCart() {
  const panel = byId("cart-panel");
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  byId("cart-backdrop").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  const panel = byId("cart-panel");
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  byId("cart-backdrop").classList.add("hidden");
  document.body.style.overflow = "";
}

function showOrderModal(order) {
  byId("order-qr").src = order.qrDataUrl;
  byId("order-code").textContent = `#${new Intl.NumberFormat("ar-DZ").format(order.id)}`;
  byId("open-order").href = `/order/${encodeURIComponent(order.token)}`;
  const summary = byId("order-summary");
  summary.replaceChildren();
  order.items.forEach((item) => {
    const row = makeElement("div", "summary-row");
    row.append(makeElement("span", "", `${item.name} × ${new Intl.NumberFormat("ar-DZ").format(item.quantity)}`));
    row.append(makeMoneyElement(item.subtotal, "strong"));
    summary.append(row);
  });
  const totalRow = makeElement("div", "summary-row");
  totalRow.append(makeElement("span", "", "المجموع"));
  totalRow.append(makeMoneyElement(order.total, "strong"));
  summary.append(totalRow);
  byId("order-modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

async function submitOrder(event) {
  event.preventDefault();
  const message = byId("checkout-message");
  hideMessage(message);
  const button = byId("place-order");
  button.disabled = true;
  button.textContent = "جارٍ إرسال طلبك...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: byId("customer-name").value,
        items: [...cart.entries()].map(([id, quantity]) => ({ id, quantity }))
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || (response.status === 429 ? "طلبات كثيرة بسرعة. انتظر قليلًا ثم حاول مجددًا." : "تعذّر إرسال الطلب. حاول مرة أخرى."));
    }

    cart.clear();
    renderCart();
    closeCart();
    showOrderModal(data);
  } catch (error) {
    showMessage(message, error.message || "تعذّر الاتصال بالخادم. تحقق من اتصالك.");
  } finally {
    button.textContent = "تأكيد وإصدار رمز QR ←";
    button.disabled = cart.size === 0;
  }
}

function renderTrackingOrder(order) {
  const card = byId("tracking-card");
  const status = makeElement(
    "span",
    `tracking-status${order.status === "confirmed" ? " confirmed" : ""}`,
    order.status === "confirmed" ? "تم تأكيد الطلب من الموظف" : "بانتظار تأكيد الموظف"
  );
  const heading = makeElement("h1", "", `طلب ${new Intl.NumberFormat("ar-DZ").format(order.id)}`);
  const greeting = makeElement("p", "", `أهلًا ${order.customerName}، هذا ملخص طلبك.`);
  const lines = makeElement("div", "tracking-lines");
  order.items.forEach((item) => {
    const row = makeElement("div", "tracking-line");
    row.append(makeElement("span", "", `${item.name} × ${new Intl.NumberFormat("ar-DZ").format(item.quantity)}`));
    row.append(makeMoneyElement(item.subtotal, "strong"));
    lines.append(row);
  });
  const total = makeElement("div", "tracking-line tracking-total");
  total.append(makeElement("span", "", "المجموع"), makeMoneyElement(order.total, "strong"));
  lines.append(total);
  card.replaceChildren(status, heading, greeting, lines);
}

async function loadTrackingOrder(token) {
  menuView.classList.add("hidden");
  trackingView.classList.remove("hidden");
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(token)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "لم يتم العثور على الطلب.");
    renderTrackingOrder(data);
  } catch (error) {
    const card = byId("tracking-card");
    card.replaceChildren(makeElement("h1", "", "تعذّر العثور على الطلب"), makeElement("p", "", error.message));
  }
}

async function start() {
  const orderMatch = window.location.pathname.match(/^\/order\/([A-Za-z0-9_-]{20,128})\/?$/);
  if (orderMatch) {
    await loadTrackingOrder(orderMatch[1]);
    return;
  }

  try {
    const response = await fetch("/api/menu");
    if (!response.ok) throw new Error("تعذّر تحميل القائمة.");
    menuItems = await response.json();
    renderMenu();
    renderCart();
  } catch (error) {
    byId("menu-grid").replaceChildren(makeElement("p", "form-message", error.message));
  }
}

byId("cart-toggle").addEventListener("click", openCart);
byId("cart-close").addEventListener("click", closeCart);
byId("cart-backdrop").addEventListener("click", closeCart);
byId("checkout-form").addEventListener("submit", submitOrder);
byId("modal-close").addEventListener("click", () => {
  byId("order-modal").classList.add("hidden");
  document.body.style.overflow = "";
});
byId("order-modal").addEventListener("click", (event) => {
  if (event.target === byId("order-modal")) {
    byId("order-modal").classList.add("hidden");
    document.body.style.overflow = "";
  }
});
start();
