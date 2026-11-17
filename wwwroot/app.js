const byId = (id) => document.getElementById(id);
const menuView = byId("menu-view");
const trackingView = byId("tracking-view");
const cart = new Map();
let menuItems = [];
let trackingOrder = null;
let selectedCategory = "all";
let currentLanguage = "ar";
let currentSheet = null;
let lastFocusedElement = null;
let tableNumber = new URLSearchParams(window.location.search).get("table") || "";
let customerName = "";
let orderNote = "";
let draftDishNote = "";
let toastTimer;

const ui = {
  ar: {
    eyebrow: "اختيارات تفتح النفس", menuTitle: "قائمتنا", today: "اليوم",
    subtitle: "نكهات تركية طازجة، محضّرة بمحبة في Beyti Istanbul.",
    search: "ابحث عن طبق...", callWaiter: "نادِ النادل", requestBill: "اطلب الحساب",
    all: "الكل", categories: "تصنيفات الطعام", noDishes: "لا توجد أطباق في القائمة حاليًا.", noResults: "لم نعثر على أطباق تطابق بحثك.",
    add: "أضف +", outOfStock: "نفد اليوم", popular: "الأكثر طلبًا", new: "جديد",
    spicy: "حار", vegetarian: "نباتي", currency: "درهم", cart: "سلتي",
    dishOne: "طبق", dishMany: "أطباق", review: "مراجعة الطلب", dishDetails: "تفاصيل الطبق",
    allergens: "مسببات الحساسية", askAllergens: "اسأل فريقنا عن مسببات الحساسية قبل الطلب.",
    yourNote: "ملاحظتك للمطبخ", itemNotePlaceholder: "مثلًا: من دون بصل",
    cartTitle: "مراجعة طلبك", customerName: "اسمك", namePlaceholder: "الاسم الذي يناديك به الموظف",
    tableNumber: "رقم الطاولة", tableHint: "من 1 إلى 200", orderNote: "ملاحظة للطلب",
    orderNotePlaceholder: "أي تفاصيل إضافية للمطبخ؟", total: "المجموع",
    sendOrder: "إرسال الطلب", sendingOrder: "جارٍ إرسال الطلب...", orderNoteHint: "سيظهر لك رمز QR ورمز الطلب بعد الإرسال.",
    serviceTitle: "أرسل طلبًا للطاولة", serviceWaiter: "سيصل تنبيهك إلى فريق المطعم.",
    serviceBill: "سيصل طلب الحساب إلى فريق المطعم.", sendRequest: "إرسال الطلب",
    sendingRequest: "جارٍ الإرسال...", serviceSent: "تم إرسال طلبك للطاولة.",
    requestDuplicate: "يوجد طلب مفتوح مماثل لهذه الطاولة بالفعل.", close: "إغلاق",
    rateLimited: "طلبات كثيرة بسرعة. انتظر قليلًا ثم حاول مجددًا.",
    footer: "طازج على طاولتك.", backToMenu: "← العودة إلى قائمة الطعام", homePage: "الصفحة الرئيسية",
    languageLabel: "اختيار اللغة", decrease: "تقليل كمية", increase: "زيادة كمية",
    orderCreated: "تم إنشاء الطلب", orderCodeTitle: "هذا رمز طلبك الخاص",
    orderCodeCopy: "أرِ رمز QR أو الرمز أسفله لموظف الطلبات ليبحث عن طلبك ويتأكد منه.",
    orderNumber: "رقم الطلب", manualCode: "رمز الطلب للإدخال اليدوي",
    qrAlt: "رمز QR الخاص بطلبك",
    trackingLink: "افتح صفحة متابعة الطلب ↗", pending: "بانتظار تأكيد الموظف",
    confirmed: "تم تأكيد الطلب من الموظف", orderHeading: "طلب",
    orderGreeting: "هذا ملخص طلبك.", loadingOrder: "جارٍ تحميل الطلب...",
    reviewTitle: "شكرًا لاختياركم Beyti Istanbul",
    reviewCopy: "نأمل أن تكون تجربتكم قد نالت رضاكم. يسعدنا أن تشاركونا رأيكم على Google.",
    reviewButton: "قيّمنا على Google",
    reviewHint: "رأيكم يساعدنا على تقديم الأفضل دائمًا.",
    orderNotFound: "لم يتم العثور على الطلب.", nameRequired: "أدخل اسمك ورقم الطاولة.",
    invalidTable: "أدخل رقم طاولة صحيحًا من 1 إلى 200.",
    orderUnavailable: "تعذّر إرسال الطلب. ربما لم يعد أحد الأطباق متاحًا؛ حدّث القائمة وحاول مجددًا.",
    orderError: "تعذّر إرسال الطلب. حاول مرة أخرى.",
    requestError: "تعذّر إرسال الطلب. حاول مرة أخرى.", footerTitle: "Beyti Istanbul",
    themeDark: "تفعيل الوضع الداكن", themeLight: "تفعيل الوضع الفاتح",
    themeDarkTitle: "الوضع الداكن", themeLightTitle: "الوضع الفاتح"
  },
  fr: {
    eyebrow: "Des choix qui ouvrent l’appétit", menuTitle: "Notre carte", today: "du jour",
    subtitle: "Des saveurs turques fraîches, préparées avec soin chez Beyti Istanbul.",
    search: "Rechercher un plat...", callWaiter: "Appeler le serveur", requestBill: "Demander l’addition",
    all: "Tout", categories: "Catégories", noDishes: "Aucun plat n’est disponible pour le moment.", noResults: "Aucun plat ne correspond à votre recherche.",
    add: "Ajouter +", outOfStock: "Épuisé aujourd’hui", popular: "Populaire", new: "Nouveau",
    spicy: "Épicé", vegetarian: "Végétarien", currency: "DH", cart: "Mon panier",
    dishOne: "plat", dishMany: "plats", review: "Voir la commande", dishDetails: "Détails du plat",
    allergens: "Allergènes", askAllergens: "Veuillez demander les informations sur les allergènes à notre équipe.",
    yourNote: "Note pour la cuisine", itemNotePlaceholder: "Ex. : sans oignon",
    cartTitle: "Vérifier votre commande", customerName: "Votre nom", namePlaceholder: "Le nom à communiquer au serveur",
    tableNumber: "Numéro de table", tableHint: "De 1 à 200", orderNote: "Note pour la commande",
    orderNotePlaceholder: "Une précision pour la cuisine ?", total: "Total",
    sendOrder: "Envoyer la commande", sendingOrder: "Envoi en cours...", orderNoteHint: "Un QR code et un code de commande s’afficheront après l’envoi.",
    serviceTitle: "Envoyer une demande à la table", serviceWaiter: "Une notification sera envoyée à l’équipe du restaurant.",
    serviceBill: "Votre demande d’addition sera envoyée à l’équipe du restaurant.", sendRequest: "Envoyer la demande",
    sendingRequest: "Envoi...", serviceSent: "Votre demande a été envoyée à la table.",
    requestDuplicate: "Une demande similaire est déjà en attente pour cette table.", close: "Fermer",
    rateLimited: "Trop de demandes. Veuillez patienter avant de réessayer.",
    footer: "Frais à votre table.", backToMenu: "← Retour à la carte", homePage: "Page d’accueil",
    languageLabel: "Choisir la langue", decrease: "Diminuer la quantité", increase: "Augmenter la quantité",
    orderCreated: "Commande créée", orderCodeTitle: "Voici votre code de commande",
    orderCodeCopy: "Présentez le QR code ou le code ci-dessous au personnel pour vérifier votre commande.",
    orderNumber: "Numéro de commande", manualCode: "Code de commande à saisir",
    qrAlt: "Votre QR code de commande",
    trackingLink: "Suivre la commande ↗", pending: "En attente de confirmation du personnel",
    confirmed: "Commande confirmée par le personnel", orderHeading: "Commande",
    orderGreeting: "Voici le récapitulatif de votre commande.", loadingOrder: "Chargement de la commande...",
    reviewTitle: "Merci d’avoir choisi Beyti Istanbul",
    reviewCopy: "Nous espérons que votre expérience vous a plu. Votre avis sur Google nous ferait très plaisir.",
    reviewButton: "Laissez-nous un avis sur Google",
    reviewHint: "Votre avis nous aide à toujours mieux vous servir.",
    orderNotFound: "Commande introuvable.", nameRequired: "Saisissez votre nom et votre numéro de table.",
    invalidTable: "Saisissez un numéro de table entre 1 et 200.",
    orderUnavailable: "Commande impossible. Un plat n’est peut-être plus disponible ; actualisez la carte et réessayez.",
    orderError: "Impossible d’envoyer la commande. Réessayez.",
    requestError: "Impossible d’envoyer la demande. Réessayez.", footerTitle: "Beyti Istanbul",
    themeDark: "Activer le thème sombre", themeLight: "Activer le thème clair",
    themeDarkTitle: "Thème sombre", themeLightTitle: "Thème clair"
  },
  en: {
    eyebrow: "A little something to look forward to", menuTitle: "Our menu", today: "today",
    subtitle: "Fresh Turkish flavors, lovingly prepared at Beyti Istanbul.",
    search: "Search dishes...", callWaiter: "Call waiter", requestBill: "Request bill",
    all: "All", categories: "Menu categories", noDishes: "No dishes are available right now.", noResults: "No dishes match your search.",
    add: "Add +", outOfStock: "Sold out today", popular: "Popular", new: "New",
    spicy: "Spicy", vegetarian: "Vegetarian", currency: "MAD", cart: "My order",
    dishOne: "dish", dishMany: "dishes", review: "Review order", dishDetails: "Dish details",
    allergens: "Allergens", askAllergens: "Please ask our team about allergen information before ordering.",
    yourNote: "Note for the kitchen", itemNotePlaceholder: "For example: no onions",
    cartTitle: "Review your order", customerName: "Your name", namePlaceholder: "Name for the team",
    tableNumber: "Table number", tableHint: "1 to 200", orderNote: "Order note",
    orderNotePlaceholder: "Anything else for the kitchen?", total: "Total",
    sendOrder: "Send order", sendingOrder: "Sending order...", orderNoteHint: "Your QR code and order code will appear after sending.",
    serviceTitle: "Send a table request", serviceWaiter: "A notification will be sent to the restaurant team.",
    serviceBill: "Your bill request will be sent to the restaurant team.", sendRequest: "Send request",
    sendingRequest: "Sending...", serviceSent: "Your table request has been sent.",
    requestDuplicate: "A similar request is already open for this table.", close: "Close",
    rateLimited: "Too many requests. Please wait a moment and try again.",
    footer: "Fresh to your table.", backToMenu: "← Back to the menu", homePage: "Home page",
    languageLabel: "Choose language", decrease: "Decrease quantity", increase: "Increase quantity",
    orderCreated: "Order created", orderCodeTitle: "Here is your order code",
    orderCodeCopy: "Show the QR code or the code below to the order staff for verification.",
    orderNumber: "Order number", manualCode: "Manual order code",
    qrAlt: "Your order QR code",
    trackingLink: "Track your order ↗", pending: "Waiting for staff confirmation",
    confirmed: "Order confirmed by staff", orderHeading: "Order",
    orderGreeting: "Here is your order summary.", loadingOrder: "Loading order...",
    reviewTitle: "Thank you for choosing Beyti Istanbul",
    reviewCopy: "We hope you enjoyed your experience. We’d love to hear what you think on Google.",
    reviewButton: "Rate us on Google",
    reviewHint: "Your feedback helps us serve you even better.",
    orderNotFound: "Order not found.", nameRequired: "Enter your name and table number.",
    invalidTable: "Enter a table number from 1 to 200.",
    orderUnavailable: "The order could not be sent. A dish may no longer be available; refresh the menu and try again.",
    orderError: "Could not send the order. Please try again.",
    requestError: "Could not send the request. Please try again.", footerTitle: "Beyti Istanbul",
    themeDark: "Enable dark mode", themeLight: "Enable light mode",
    themeDarkTitle: "Dark mode", themeLightTitle: "Light mode"
  }
};

currentLanguage = readPreference("beyti-language", "ar");

function readPreference(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value && Object.prototype.hasOwnProperty.call(ui, value) ? value : fallback;
  } catch (error) {
    console.warn("Could not read menu preference.", error);
    return fallback;
  }
}

function writePreference(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Could not save menu preference.", error);
  }
}

function dictionary() {
  return ui[currentLanguage];
}

function showMessage(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatNumber(value) {
  const locale = currentLanguage === "ar" ? "ar-MA" : currentLanguage === "fr" ? "fr-MA" : "en-US";
  return new Intl.NumberFormat(locale).format(value);
}

function makeMoneyElement(value, tag = "span", className = "") {
  const element = makeElement(tag, `money${className ? ` ${className}` : ""}`);
  element.dir = "ltr";
  element.append(makeElement("span", "", formatNumber(value)), makeElement("span", "currency-label", dictionary().currency));
  return element;
}

function getLocalizedItem(item) {
  const locale = item.translations?.[currentLanguage] ?? {};
  const fallback = item.translations?.ar ?? {};
  return {
    name: locale.name || (currentLanguage === "fr" ? item.name : fallback.name || item.name),
    description: locale.description || (currentLanguage === "fr" ? item.description : fallback.description || item.description),
    category: locale.category || (currentLanguage === "fr" ? item.category : fallback.category || item.category),
    allergens: locale.allergens || dictionary().askAllergens
  };
}

function makeDishVisual(item, imageClass, fallbackClass) {
  if (!item.imageData) return makeElement("span", fallbackClass, item.emoji || "🍽");
  const image = makeElement("img", imageClass);
  image.src = item.imageData;
  image.alt = getLocalizedItem(item).name;
  image.loading = "lazy";
  image.addEventListener("error", () => {
    image.replaceWith(makeElement("span", fallbackClass, item.emoji || "🍽"));
  }, { once: true });
  return image;
}

function badgeLabel(badge) {
  return ({
    popular: dictionary().popular,
    new: dictionary().new,
    spicy: dictionary().spicy,
    vegetarian: dictionary().vegetarian
  })[badge];
}

function currentQuantity(itemId) {
  return cart.get(itemId)?.quantity ?? 0;
}

function setQuantity(item, quantity, note = null) {
  if (!item.isAvailable) return;
  const existing = cart.get(item.id);
  const nextQuantity = Math.max(0, Math.min(10, quantity));
  if (nextQuantity === 0) {
    cart.delete(item.id);
  } else {
    cart.set(item.id, {
      quantity: nextQuantity,
      note: note ?? existing?.note ?? (currentSheet?.type === "dish" && currentSheet.itemId === item.id ? draftDishNote : "")
    });
  }
  renderMenu();
  renderCartToggle();
  if (currentSheet?.type === "cart") renderCartSheet();
  if (currentSheet?.type === "dish" && currentSheet.itemId === item.id) renderDishSheet(item);
}

function makeQuantityControl(item) {
  const quantity = currentQuantity(item.id);
  if (!item.isAvailable) {
    const soldOut = makeElement("button", "sold-out-button", dictionary().outOfStock);
    soldOut.type = "button";
    soldOut.disabled = true;
    return soldOut;
  }
  if (!quantity) {
    const add = makeElement("button", "add-button", dictionary().add);
    add.type = "button";
    add.setAttribute("aria-label", `${dictionary().add} ${getLocalizedItem(item).name}`);
    add.addEventListener("click", () => setQuantity(item, 1));
    return add;
  }

  const controls = makeElement("div", "quantity-control menu-quantity-control");
  const decrement = makeElement("button", "", "−");
  decrement.type = "button";
  decrement.setAttribute("aria-label", `${dictionary().decrease} ${getLocalizedItem(item).name}`);
  decrement.addEventListener("click", () => setQuantity(item, quantity - 1));
  const count = makeElement("span", "", formatNumber(quantity));
  const increment = makeElement("button", "", "+");
  increment.type = "button";
  increment.setAttribute("aria-label", `${dictionary().increase} ${getLocalizedItem(item).name}`);
  increment.disabled = quantity >= 10;
  increment.addEventListener("click", () => setQuantity(item, quantity + 1));
  controls.append(decrement, count, increment);
  return controls;
}

function searchText(item) {
  return [
    item.name, item.description, item.category,
    ...["ar", "fr", "en"].flatMap((language) => {
      const locale = item.translations?.[language];
      return locale ? [locale.name, locale.description, locale.category] : [];
    })
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

function renderMenu() {
  const filters = byId("category-filters");
  const grid = byId("menu-grid");
  const categories = [...new Set(menuItems.map((item) => item.category))];
  if (selectedCategory !== "all" && !categories.includes(selectedCategory)) selectedCategory = "all";
  filters.replaceChildren();

  const categoryButton = (key, label) => {
    const button = makeElement("button", `filter-chip${key === selectedCategory ? " selected" : ""}`, label);
    button.type = "button";
    button.setAttribute("aria-pressed", String(key === selectedCategory));
    button.addEventListener("click", () => {
      selectedCategory = key;
      renderMenu();
    });
    filters.append(button);
  };
  categoryButton("all", dictionary().all);
  categories.forEach((category) => {
    const item = menuItems.find((candidate) => candidate.category === category);
    categoryButton(category, item ? getLocalizedItem(item).category : category);
  });

  const search = byId("menu-search").value.trim().toLocaleLowerCase();
  const visibleItems = menuItems.filter((item) =>
    (selectedCategory === "all" || item.category === selectedCategory) &&
    (!search || searchText(item).includes(search)));
  grid.replaceChildren();
  if (visibleItems.length === 0) {
    grid.append(makeElement("p", "menu-empty-state", menuItems.length === 0 ? dictionary().noDishes : dictionary().noResults));
    return;
  }

  visibleItems.forEach((item, index) => {
    const localized = getLocalizedItem(item);
    const card = makeElement("article", `menu-card${item.isAvailable ? "" : " menu-card-sold-out"}`);
    card.style.setProperty("--card-index", String(index));

    const art = makeElement("button", "food-art");
    art.type = "button";
    art.setAttribute("aria-label", `${dictionary().dishDetails}: ${localized.name}`);
    if (item.imageData) art.classList.add("has-photo");
    art.append(makeDishVisual(item, "food-photo", "food-emoji"));
    const badges = [...(item.badges ?? [])].slice(0, 2);
    if (!item.isAvailable) badges.unshift("soldOut");
    badges.slice(0, 2).forEach((badge) => {
      const label = badge === "soldOut" ? dictionary().outOfStock : badgeLabel(badge);
      if (label) art.append(makeElement("span", `food-badge${badge === "spicy" ? " badge-spicy" : ""}${badge === "vegetarian" ? " badge-vegetarian" : ""}`, label));
    });
    art.addEventListener("click", () => openDishSheet(item));

    const meta = makeElement("div", "food-meta");
    const details = makeElement("button", "food-info");
    details.type = "button";
    details.append(
      makeElement("h2", "", localized.name),
      makeElement("p", "", localized.description)
    );
    details.addEventListener("click", () => openDishSheet(item));
    const footer = makeElement("div", "food-footer");
    footer.append(makeMoneyElement(item.price, "span", "food-price"), makeQuantityControl(item));
    meta.append(details, footer);
    card.append(art, meta);
    grid.append(card);
  });
}

function cartTotals() {
  const items = [...cart.entries()]
    .map(([id, entry]) => ({ item: menuItems.find((menuItem) => menuItem.id === id), ...entry }))
    .filter((entry) => entry.item);
  return {
    items,
    count: items.reduce((sum, entry) => sum + entry.quantity, 0),
    total: items.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0)
  };
}

function renderCartToggle() {
  const { count, total } = cartTotals();
  byId("cart-toggle").classList.toggle("hidden", count === 0);
  byId("cart-label").textContent = `${dictionary().cart} · ${formatNumber(count)} ${count === 1 ? dictionary().dishOne : dictionary().dishMany}`;
  byId("cart-count").textContent = formatNumber(count);
  byId("cart-total").replaceChildren(
    makeElement("span", "", formatNumber(total)),
    makeElement("span", "currency-label", dictionary().currency)
  );
  byId("cart-review-label").textContent = dictionary().review;
  byId("cart-toggle").setAttribute("aria-label", dictionary().review);
}

function appendSheetHeader(container, title) {
  const header = makeElement("div", "sheet-header");
  const copy = makeElement("div");
  copy.append(makeElement("span", "sheet-eyebrow", dictionary().footerTitle), makeElement("h2", "", title));
  const close = makeElement("button", "icon-button", "×");
  close.type = "button";
  close.setAttribute("aria-label", dictionary().close);
  close.addEventListener("click", closeSheet);
  header.append(copy, close);
  container.append(header);
}

function renderCartSheet() {
  const content = byId("sheet-content");
  content.replaceChildren();
  appendSheetHeader(content, dictionary().cartTitle);
  const { items, total } = cartTotals();
  const list = makeElement("div", "cart-items");
  items.forEach(({ item, quantity, note }) => {
    const row = makeElement("div", "cart-line");
    row.append(makeDishVisual(item, "cart-line-image", "cart-line-emoji"));
    const info = makeElement("div", "cart-line-info");
    info.append(makeElement("strong", "", getLocalizedItem(item).name), makeMoneyElement(item.price * quantity));
    const noteButton = makeElement("button", "line-note-button", note ? dictionary().yourNote : dictionary().itemNotePlaceholder);
    noteButton.type = "button";
    noteButton.addEventListener("click", () => openDishSheet(item));
    info.append(noteButton);
    const controls = makeQuantityControl(item);
    row.append(info, controls);
    list.append(row);
  });
  content.append(list);

  const form = makeElement("form", "checkout-form");
  form.id = "checkout-form";
  const customerLabel = makeElement("label", "", dictionary().customerName);
  const customerInput = makeElement("input");
  customerInput.name = "customerName";
  customerInput.maxLength = 80;
  customerInput.placeholder = dictionary().namePlaceholder;
  customerInput.autocomplete = "name";
  customerInput.required = true;
  customerInput.value = customerName;
  customerInput.addEventListener("input", () => { customerName = customerInput.value; });
  customerLabel.append(customerInput);

  const tableLabel = makeElement("label", "", dictionary().tableNumber);
  const tableInput = makeElement("input");
  tableInput.id = "table-number";
  tableInput.name = "tableNumber";
  tableInput.type = "number";
  tableInput.min = "1";
  tableInput.max = "200";
  tableInput.inputMode = "numeric";
  tableInput.placeholder = dictionary().tableHint;
  tableInput.required = true;
  tableInput.value = tableNumber;
  tableInput.addEventListener("input", () => { tableNumber = tableInput.value; });
  tableLabel.append(tableInput);

  const noteLabel = makeElement("label", "", dictionary().orderNote);
  const noteInput = makeElement("textarea");
  noteInput.name = "notes";
  noteInput.maxLength = 500;
  noteInput.rows = 2;
  noteInput.placeholder = dictionary().orderNotePlaceholder;
  noteInput.value = orderNote;
  noteInput.addEventListener("input", () => { orderNote = noteInput.value; });
  noteLabel.append(noteInput);
  form.append(customerLabel, tableLabel, noteLabel);

  const summary = makeElement("div", "cart-summary");
  summary.append(makeElement("span", "", dictionary().total), makeMoneyElement(total, "strong"));
  const submit = makeElement("button", "primary-button", dictionary().sendOrder);
  submit.id = "place-order";
  submit.type = "submit";
  submit.disabled = items.length === 0;
  form.append(summary, submit, makeElement("p", "form-note", dictionary().orderNoteHint));
  const message = makeElement("p", "form-message hidden");
  message.id = "checkout-message";
  message.setAttribute("role", "alert");
  form.append(message);
  form.addEventListener("submit", submitOrder);
  content.append(form);
}

function renderDishSheet(item) {
  const content = byId("sheet-content");
  content.replaceChildren();
  appendSheetHeader(content, dictionary().dishDetails);
  const image = makeElement("div", "dish-detail-image");
  if (item.imageData) image.classList.add("has-photo");
  image.append(makeDishVisual(item, "dish-detail-photo", "dish-detail-emoji"));
  const namePrice = makeElement("div", "dish-detail-heading");
  namePrice.append(makeElement("h2", "", getLocalizedItem(item).name), makeMoneyElement(item.price, "strong"));
  const description = makeElement("p", "dish-detail-description", getLocalizedItem(item).description);
  const allergens = makeElement("p", "dish-allergens");
  allergens.append(makeElement("strong", "", `${dictionary().allergens}: `), document.createTextNode(getLocalizedItem(item).allergens));
  const noteLabel = makeElement("label", "dish-note-label", dictionary().yourNote);
  const noteInput = makeElement("textarea", "dish-note-input");
  noteInput.rows = 2;
  noteInput.maxLength = 200;
  noteInput.placeholder = dictionary().itemNotePlaceholder;
  noteInput.value = draftDishNote;
  noteInput.addEventListener("input", () => {
    draftDishNote = noteInput.value;
    const existing = cart.get(item.id);
    if (existing) cart.set(item.id, { ...existing, note: draftDishNote });
  });
  noteLabel.append(noteInput);
  const footer = makeElement("div", "dish-detail-footer");
  footer.append(makeMoneyElement(item.price, "strong"), makeQuantityControl(item));
  content.append(image, namePrice, description, allergens, noteLabel, footer);
  const { count, total } = cartTotals();
  if (count > 0) {
    const review = makeElement("button", "primary-button dish-cart-review");
    review.type = "button";
    review.append(
      makeElement("span", "", `${dictionary().review} · ${formatNumber(count)} ${count === 1 ? dictionary().dishOne : dictionary().dishMany}`),
      makeMoneyElement(total)
    );
    review.addEventListener("click", () => openSheet("cart"));
    content.append(review);
  }
}

function renderServiceSheet(type) {
  const content = byId("sheet-content");
  content.replaceChildren();
  const title = type === "waiter" ? dictionary().callWaiter : dictionary().requestBill;
  appendSheetHeader(content, dictionary().serviceTitle);
  content.append(makeElement("p", "service-sheet-copy", type === "waiter" ? dictionary().serviceWaiter : dictionary().serviceBill));
  const form = makeElement("form", "checkout-form");
  form.id = "service-request-form";
  const label = makeElement("label", "", dictionary().tableNumber);
  const input = makeElement("input");
  input.name = "tableNumber";
  input.type = "number";
  input.min = "1";
  input.max = "200";
  input.inputMode = "numeric";
  input.placeholder = dictionary().tableHint;
  input.required = true;
  input.value = tableNumber;
  input.addEventListener("input", () => { tableNumber = input.value; });
  label.append(input);
  const submit = makeElement("button", "primary-button", `${dictionary().sendRequest}: ${title}`);
  submit.type = "submit";
  form.append(label, submit);
  const message = makeElement("p", "form-message hidden");
  message.id = "service-message";
  message.setAttribute("role", "alert");
  form.append(message);
  form.addEventListener("submit", (event) => submitTableRequest(event, type, submit));
  content.append(form);
}

function renderCurrentSheet() {
  if (!currentSheet) return;
  if (currentSheet.type === "cart") renderCartSheet();
  else if (currentSheet.type === "dish") renderDishSheet(menuItems.find((item) => item.id === currentSheet.itemId));
  else renderServiceSheet(currentSheet.requestType);
}

function openSheet(type, itemId = "") {
  if (type === "dish") {
    const item = menuItems.find((candidate) => candidate.id === itemId);
    if (!item) return;
    draftDishNote = cart.get(itemId)?.note ?? "";
    currentSheet = { type, itemId };
  } else if (type === "service") {
    currentSheet = { type, requestType: itemId };
  } else {
    currentSheet = { type };
  }
  lastFocusedElement = document.activeElement;
  renderCurrentSheet();
  byId("sheet-backdrop").classList.add("is-open");
  byId("sheet-backdrop").setAttribute("aria-hidden", "false");
  byId("bottom-sheet").classList.add("is-open");
  byId("bottom-sheet").setAttribute("aria-hidden", "false");
  document.body.classList.add("sheet-open");
  const closeButton = byId("sheet-content").querySelector(".sheet-header button");
  if (closeButton) window.setTimeout(() => closeButton.focus(), 120);
}

function closeSheet() {
  currentSheet = null;
  byId("sheet-backdrop").classList.remove("is-open");
  byId("sheet-backdrop").setAttribute("aria-hidden", "true");
  byId("bottom-sheet").classList.remove("is-open");
  byId("bottom-sheet").setAttribute("aria-hidden", "true");
  document.body.classList.remove("sheet-open");
  if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  lastFocusedElement = null;
}

function openDishSheet(item) {
  openSheet("dish", item.id);
}

function parseTableNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 200 ? number : null;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 409) throw new Error(dictionary().requestDuplicate);
    if (response.status === 429) throw new Error(dictionary().rateLimited);
    throw new Error(data?.message || dictionary().requestError);
  }
  return data;
}

async function sendTableRequest(type, number, button = null) {
  const idleText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = dictionary().sendingRequest;
  }
  try {
    await postJson("/api/table-requests", { tableNumber: number, type });
    closeSheet();
    showToast(dictionary().serviceSent);
  } catch (error) {
    const message = byId("service-message");
    if (message && currentSheet?.type === "service") showMessage(message, error.message);
    else showToast(error.message);
  } finally {
    if (button && button.isConnected) {
      button.disabled = false;
      button.textContent = idleText;
    }
  }
}

function requestTableService(type) {
  const currentInput = byId("table-number");
  const number = parseTableNumber(currentInput?.value || tableNumber);
  if (number) {
    tableNumber = String(number);
    void sendTableRequest(type, number);
    return;
  }
  openSheet("service", type);
}

async function submitTableRequest(event, type, button) {
  event.preventDefault();
  const number = parseTableNumber(new FormData(event.currentTarget).get("tableNumber"));
  if (!number) {
    const message = byId("service-message");
    showMessage(message, dictionary().invalidTable);
    return;
  }
  tableNumber = String(number);
  await sendTableRequest(type, number, button);
}

function showToast(message) {
  const toast = byId("menu-toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

async function submitOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const { items } = cartTotals();
  const enteredName = String(new FormData(form).get("customerName") || "").trim();
  const enteredTable = parseTableNumber(new FormData(form).get("tableNumber"));
  const message = byId("checkout-message");
  message.classList.add("hidden");
  if (!enteredName) {
    showMessage(message, dictionary().nameRequired);
    return;
  }
  if (!enteredTable) {
    showMessage(message, dictionary().invalidTable);
    return;
  }

  const button = byId("place-order");
  button.disabled = true;
  button.textContent = dictionary().sendingOrder;
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: enteredName,
        tableNumber: enteredTable,
        notes: orderNote,
        items: items.map(({ item, quantity, note }) => ({ id: item.id, quantity, notes: note }))
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) throw new Error(dictionary().rateLimited);
      if (response.status === 400) throw new Error(dictionary().orderUnavailable);
      throw new Error(data.message || dictionary().orderError);
    }
    customerName = enteredName;
    tableNumber = String(enteredTable);
    cart.clear();
    renderMenu();
    renderCartToggle();
    closeSheet();
    showOrderModal(data);
  } catch (error) {
    showMessage(message, error.message || dictionary().orderError);
  } finally {
    if (button.isConnected) button.disabled = cart.size === 0;
    if (button.isConnected) button.textContent = dictionary().sendOrder;
  }
}

function showOrderModal(order) {
  byId("order-qr").src = order.qrDataUrl;
  byId("order-number").textContent = `#${formatNumber(order.id)}`;
  byId("order-code").textContent = `${order.code.slice(0, 4)}-${order.code.slice(4)}`;
  byId("open-order").href = `/order/${encodeURIComponent(order.token)}`;
  const summary = byId("order-summary");
  summary.replaceChildren();
  order.items.forEach((item) => {
    const menuItem = menuItems.find((candidate) => candidate.id === item.id);
    const name = menuItem ? getLocalizedItem(menuItem).name : item.name;
    const row = makeElement("div", "summary-row");
    row.append(makeElement("span", "", `${name} × ${formatNumber(item.quantity)}`));
    row.append(makeMoneyElement(item.subtotal, "strong"));
    summary.append(row);
  });
  const totalRow = makeElement("div", "summary-row");
  totalRow.append(makeElement("span", "", dictionary().total), makeMoneyElement(order.total, "strong"));
  summary.append(totalRow);
  byId("order-modal").classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function renderTrackingOrder(order) {
  const card = byId("tracking-card");
  const status = makeElement(
    "span",
    `tracking-status${order.status === "confirmed" ? " confirmed" : ""}`,
    order.status === "confirmed" ? dictionary().confirmed : dictionary().pending
  );
  const heading = makeElement("h1", "", `${dictionary().orderHeading} ${formatNumber(order.id)}`);
  const greeting = makeElement("p", "", `${order.customerName}، ${dictionary().orderGreeting}`);
  const lines = makeElement("div", "tracking-lines");
  order.items.forEach((item) => {
    const row = makeElement("div", "tracking-line");
    row.append(makeElement("span", "", `${item.name} × ${formatNumber(item.quantity)}`));
    row.append(makeMoneyElement(item.subtotal, "strong"));
    lines.append(row);
  });
  if (order.notes) lines.append(makeElement("p", "tracking-note", `${dictionary().orderNote}: ${order.notes}`));
  const total = makeElement("div", "tracking-line tracking-total");
  total.append(makeElement("span", "", dictionary().total), makeMoneyElement(order.total, "strong"));
  lines.append(total);

  const review = makeElement("section", "google-review");
  review.setAttribute("aria-label", dictionary().reviewTitle);
  review.append(
    makeElement("span", "google-review-star", "★"),
    makeElement("h2", "", dictionary().reviewTitle),
    makeElement("p", "", dictionary().reviewCopy)
  );
  const siteName = document.querySelector("[data-site-name]")?.textContent?.trim() || "Beyti Istanbul";
  const reviewLink = makeElement("a", "google-review-button");
  reviewLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(siteName)}`;
  reviewLink.target = "_blank";
  reviewLink.rel = "noopener noreferrer";
  reviewLink.append(
    makeElement("span", "", dictionary().reviewButton),
    makeElement("span", "", "↗")
  );
  review.append(reviewLink, makeElement("p", "google-review-hint", dictionary().reviewHint));
  card.replaceChildren(status, heading, greeting, lines, review);
}

async function loadTrackingOrder(token) {
  menuView.classList.add("hidden");
  trackingView.classList.remove("hidden");
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(token)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || dictionary().orderNotFound);
    trackingOrder = data;
    renderTrackingOrder(data);
  } catch (error) {
    trackingOrder = null;
    const card = byId("tracking-card");
    card.replaceChildren(makeElement("h1", "", dictionary().orderNotFound), makeElement("p", "", error.message));
  }
}

function applyLanguage() {
  const strings = dictionary();
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = strings[element.dataset.i18n];
    if (value) element.textContent = value;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const value = strings[element.dataset.i18nPlaceholder];
    if (value) element.placeholder = value;
  });
  byId("menu-search").setAttribute("aria-label", strings.search);
  byId("menu").setAttribute("aria-label", strings.menuTitle);
  byId("category-filters").setAttribute("aria-label", strings.categories);
  document.querySelector(".language-switch").setAttribute("aria-label", strings.languageLabel);
  document.querySelectorAll("[data-site-brand]").forEach((brand) => brand.setAttribute("aria-label", strings.homePage));
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.language === currentLanguage));
  });
  const siteName = document.querySelector("[data-site-name]")?.textContent?.trim() || "BEYTI ISTANBUL";
  document.title = `${siteName} | ${currentLanguage === "ar" ? "قائمتنا" : currentLanguage === "fr" ? "Notre carte" : "Our menu"}`;
  byId("order-success-label").textContent = strings.orderCreated;
  byId("modal-title").textContent = strings.orderCodeTitle;
  byId("order-modal-copy").textContent = strings.orderCodeCopy;
  byId("order-number-label").textContent = strings.orderNumber;
  byId("order-code-label").textContent = strings.manualCode;
  byId("order-qr").alt = strings.qrAlt;
  byId("modal-close").setAttribute("aria-label", strings.close);
  byId("open-order").textContent = strings.trackingLink;
  const themeToggle = byId("theme-toggle");
  const isDark = document.documentElement.dataset.menuMode === "dark";
  themeToggle.setAttribute("aria-label", isDark ? strings.themeLight : strings.themeDark);
  themeToggle.title = isDark ? strings.themeLightTitle : strings.themeDarkTitle;
  themeToggle.textContent = isDark ? "☀" : "☾";
  renderMenu();
  renderCartToggle();
  renderCurrentSheet();
  if (trackingOrder && !trackingView.classList.contains("hidden")) {
    renderTrackingOrder(trackingOrder);
  }
}

function applyTheme(mode) {
  document.documentElement.dataset.menuMode = mode;
  const themeToggle = byId("theme-toggle");
  if (themeToggle) {
    const isDark = mode === "dark";
    themeToggle.setAttribute("aria-label", isDark ? dictionary().themeLight : dictionary().themeDark);
    themeToggle.title = isDark ? dictionary().themeLightTitle : dictionary().themeDarkTitle;
    themeToggle.textContent = isDark ? "☀" : "☾";
  }
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = mode === "dark" ? "#241f1b" : "#f7f1e7";
}

async function start() {
  const theme = readThemePreference();
  applyTheme(theme);
  applyLanguage();
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
    renderCartToggle();
  } catch (error) {
    byId("menu-grid").replaceChildren(makeElement("p", "form-message", error.message));
  }
}

function readThemePreference() {
  try {
    return window.localStorage.getItem("beyti-menu-theme") === "dark" ? "dark" : "light";
  } catch (error) {
    console.warn("Could not read menu theme preference.", error);
    return "light";
  }
}

byId("cart-toggle").addEventListener("click", () => openSheet("cart"));
byId("menu-search").addEventListener("input", renderMenu);
byId("call-waiter").addEventListener("click", () => requestTableService("waiter"));
byId("request-bill").addEventListener("click", () => requestTableService("bill"));
byId("order-call-waiter").addEventListener("click", () => {
  const number = parseTableNumber(tableNumber);
  if (number) void sendTableRequest("waiter", number, byId("order-call-waiter"));
});
byId("theme-toggle").addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.menuMode === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  writePreference("beyti-menu-theme", nextTheme);
});
document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => {
    currentLanguage = button.dataset.language;
    writePreference("beyti-language", currentLanguage);
    applyLanguage();
  });
});
byId("sheet-backdrop").addEventListener("click", (event) => {
  if (event.target === byId("sheet-backdrop")) closeSheet();
});
byId("modal-close").addEventListener("click", () => {
  byId("order-modal").classList.add("hidden");
  document.body.classList.remove("modal-open");
});
byId("order-modal").addEventListener("click", (event) => {
  if (event.target === byId("order-modal")) {
    byId("order-modal").classList.add("hidden");
    document.body.classList.remove("modal-open");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSheet();
    byId("order-modal").classList.add("hidden");
    document.body.classList.remove("modal-open");
  }
});

start();
