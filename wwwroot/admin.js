const byId = (id) => document.getElementById(id);
const loginPanel = byId("admin-login");
const workspace = byId("admin-workspace");
const adminMessage = byId("admin-message");
const successMessage = byId("admin-success");
let menuItems = [];
let staffAccounts = [];
let currentMenuImageData = null;
let selectedMenuImageData = null;
let savedSiteSettings = { theme: "sufra", siteName: "سفرة", logoData: null };
let siteSettingsLoaded = false;
let savedAdminProfile = { displayName: "مدير سفرة", avatarData: null };
let selectedSiteLogoData = null;
let selectedAdminAvatarData = null;

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

function showMenuImagePreview(imageData, placeholderText) {
  const image = byId("menu-image-preview");
  const placeholder = byId("menu-image-placeholder");
  if (imageData) {
    image.src = imageData;
    image.classList.remove("hidden");
    placeholder.classList.add("hidden");
  } else {
    image.removeAttribute("src");
    image.classList.add("hidden");
    placeholder.textContent = placeholderText;
    placeholder.classList.remove("hidden");
  }
}

function showImagePreview(imageId, placeholderId, imageData, placeholderText) {
  const image = byId(imageId);
  const placeholder = byId(placeholderId);
  if (imageData) {
    image.src = imageData;
    image.classList.remove("hidden");
    placeholder.classList.add("hidden");
  } else {
    image.removeAttribute("src");
    image.classList.add("hidden");
    placeholder.textContent = placeholderText;
    placeholder.classList.remove("hidden");
  }
}

function updateAdminAvatar(profile) {
  const avatar = byId("admin-avatar");
  avatar.replaceChildren();
  if (profile.avatarData) {
    const image = makeElement("img", "admin-avatar-image");
    image.src = profile.avatarData;
    image.alt = "";
    avatar.append(image);
  } else {
    avatar.textContent = Array.from(profile.displayName)[0] || "م";
  }
  byId("admin-display-name").textContent = profile.displayName;
}

function previewSiteSettings() {
  const selected = document.querySelector('input[name="site-theme"]:checked');
  if (!selected) return;
  const logoData = byId("site-logo-remove").checked ? null : selectedSiteLogoData ?? savedSiteSettings.logoData;
  window.applySiteSettings({
    theme: selected.value,
    siteName: byId("site-name").value,
    logoData
  });
}

function showMessage(element, text) {
  element.textContent = text;
  element.classList.remove("hidden");
}

function hideMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

function closeSiteSettings() {
  const panel = byId("admin-settings-panel");
  panel.classList.add("hidden");
  byId("admin-dashboard").classList.remove("hidden");
  byId("admin-settings-toggle").setAttribute("aria-expanded", "false");
  document.querySelectorAll('input[name="site-theme"]').forEach((input) => {
    input.checked = input.value === savedSiteSettings.theme;
  });
  byId("site-name").value = savedSiteSettings.siteName;
  byId("site-logo").value = "";
  byId("site-logo-remove").checked = false;
  selectedSiteLogoData = null;
  showImagePreview("site-logo-preview", "site-logo-placeholder", savedSiteSettings.logoData, "سيظهر الحرف الأول من الاسم افتراضيًا");
  if (siteSettingsLoaded) window.applySiteSettings(savedSiteSettings);
  if (savedAdminProfile) {
    byId("admin-profile-name").value = savedAdminProfile.displayName;
    showImagePreview("admin-profile-preview", "admin-profile-placeholder", savedAdminProfile.avatarData, "اختر صورة شخصية");
  }
  byId("admin-profile-image").value = "";
  byId("admin-profile-image-remove").checked = false;
  selectedAdminAvatarData = null;
  byId("admin-password-form").reset();
}

function showWorkspace(authenticated) {
  if (!authenticated) closeSiteSettings();
  byId("admin-intro").classList.toggle("hidden", authenticated);
  loginPanel.classList.toggle("hidden", authenticated);
  workspace.classList.toggle("hidden", !authenticated);
}

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...options });
  } catch {
    throw new Error("تعذّر الاتصال بالخادم. تحقق من اتصالك.");
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.status === 401) {
    showWorkspace(false);
    throw new Error(url === "/api/admin/login"
      ? "اسم المستخدم أو كلمة المرور غير صحيحة."
      : "انتهت الجلسة. سجّل الدخول مجددًا.");
  }
  if (!response.ok) {
    throw new Error(response.status === 429
      ? "محاولات دخول كثيرة. انتظر قليلًا ثم حاول مجددًا."
      : data?.message || "تعذّر تنفيذ العملية.");
  }
  return data;
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

function setSuccess(message) {
  hideMessage(adminMessage);
  showMessage(successMessage, message);
  window.setTimeout(() => hideMessage(successMessage), 3500);
}

function renderMenu() {
  const list = byId("admin-menu-list");
  byId("menu-item-count").textContent = `${new Intl.NumberFormat("ar-DZ").format(menuItems.length)} طبق`;
  list.replaceChildren();
  if (menuItems.length === 0) {
    list.append(makeElement("div", "admin-empty", "لا توجد أطباق في القائمة بعد."));
    return;
  }

  menuItems.forEach((item) => {
    const card = makeElement("article", `admin-record-card${item.isAvailable ? "" : " record-inactive"}`);
    const details = makeElement("div", "record-details");
    const title = makeElement("div", "record-title");
    title.append(makeDishVisual(item, "record-image", "record-emoji"), makeElement("strong", "", item.name));
    const price = makeElement("div", "record-subtitle");
    price.append(document.createTextNode(`${item.category} · `), makeMoneyElement(item.price));
    details.append(title, price);
    if (item.description) details.append(makeElement("p", "record-description", item.description));
    const status = makeElement("span", `record-status${item.isAvailable ? " active" : ""}`, item.isAvailable ? "متاح" : "موقوف");
    const actions = makeElement("div", "record-actions");
    const edit = makeElement("button", "small-action", "تعديل");
    edit.type = "button";
    edit.addEventListener("click", () => editMenu(item));
    const toggle = makeElement("button", "small-action", item.isAvailable ? "إيقاف" : "إعادة للقائمة");
    toggle.type = "button";
    toggle.addEventListener("click", () => setMenuAvailability(item, !item.isAvailable));
    const remove = makeElement("button", "small-action danger", "حذف");
    remove.type = "button";
    remove.addEventListener("click", () => deleteMenuItem(item));
    actions.append(edit, toggle, remove);
    card.append(details, status, actions);
    list.append(card);
  });
}

byId("admin-menu-qr-button").addEventListener("click", async () => {
  const card = byId("admin-menu-qr-card");
  if (!card.classList.contains("hidden")) {
    card.classList.add("hidden");
    return;
  }
  try {
    const data = await api("/api/admin/menu-qr");
    byId("admin-menu-qr-image").src = data.qrDataUrl;
    byId("admin-menu-qr-download").href = data.qrDataUrl;
    card.classList.remove("hidden");
  } catch (error) {
    showMessage(adminMessage, error.message);
  }
});

function resetMenuForm() {
  byId("menu-form").reset();
  byId("menu-id").value = "";
  byId("menu-image").required = true;
  currentMenuImageData = null;
  selectedMenuImageData = null;
  showMenuImagePreview(null, "اختر صورة واضحة للطبق");
  byId("menu-available").checked = true;
  byId("menu-form-title").textContent = "إضافة طبق جديد";
  byId("menu-submit").textContent = "إضافة إلى القائمة";
  byId("menu-cancel").classList.add("hidden");
}

function editMenu(item) {
  const arabic = item.translations?.ar ?? {};
  const french = item.translations?.fr ?? {};
  const english = item.translations?.en ?? {};
  byId("menu-id").value = item.id;
  byId("menu-name").value = arabic.name || item.name;
  byId("menu-description").value = arabic.description || item.description;
  byId("menu-category").value = arabic.category || item.category;
  byId("menu-allergens-ar").value = arabic.allergens || "";
  byId("menu-name-fr").value = french.name || "";
  byId("menu-description-fr").value = french.description || "";
  byId("menu-category-fr").value = french.category || "";
  byId("menu-allergens-fr").value = french.allergens || "";
  byId("menu-name-en").value = english.name || "";
  byId("menu-description-en").value = english.description || "";
  byId("menu-category-en").value = english.category || "";
  byId("menu-allergens-en").value = english.allergens || "";
  byId("menu-price").value = item.price;
  byId("menu-image").value = "";
  byId("menu-image").required = false;
  currentMenuImageData = item.imageData;
  selectedMenuImageData = null;
  showMenuImagePreview(currentMenuImageData, "لا توجد صورة محفوظة؛ اختر صورة للطبق.");
  byId("menu-available").checked = item.isAvailable;
  byId("menu-badge-popular").checked = item.badges?.includes("popular") ?? false;
  byId("menu-badge-new").checked = item.badges?.includes("new") ?? false;
  byId("menu-badge-spicy").checked = item.badges?.includes("spicy") ?? false;
  byId("menu-badge-vegetarian").checked = item.badges?.includes("vegetarian") ?? false;
  byId("menu-form-title").textContent = "تعديل بيانات الطبق";
  byId("menu-submit").textContent = "حفظ التعديلات";
  byId("menu-cancel").classList.remove("hidden");
  byId("menu-name").focus();
}

async function loadMenu() {
  menuItems = await api("/api/admin/menu");
  renderMenu();
}

async function loadSiteSettings() {
  const settings = await api("/api/site-settings");
  const selected = [...document.querySelectorAll('input[name="site-theme"]')]
    .find((input) => input.value === settings.theme);
  if (!selected) throw new Error("إعداد ثيم الموقع غير معروف.");
  selected.checked = true;
  savedSiteSettings = settings;
  siteSettingsLoaded = true;
  byId("site-name").value = settings.siteName;
  byId("site-logo").value = "";
  byId("site-logo-remove").checked = false;
  selectedSiteLogoData = null;
  showImagePreview("site-logo-preview", "site-logo-placeholder", settings.logoData, "سيظهر الحرف الأول من الاسم افتراضيًا");
  window.applySiteSettings(settings);
}

async function loadAdminProfile() {
  const profile = await api("/api/admin/profile");
  if (!profile || typeof profile.displayName !== "string") {
    throw new Error("تعذّر تحميل ملف المدير.");
  }
  savedAdminProfile = profile;
  byId("admin-profile-name").value = savedAdminProfile.displayName;
  byId("admin-profile-image").value = "";
  byId("admin-profile-image-remove").checked = false;
  selectedAdminAvatarData = null;
  showImagePreview("admin-profile-preview", "admin-profile-placeholder", savedAdminProfile.avatarData, "اختر صورة شخصية");
  updateAdminAvatar(savedAdminProfile);
}

async function setMenuAvailability(item, isAvailable) {
  hideMessage(adminMessage);
  try {
    if (!isAvailable && !window.confirm(`هل تريد إظهار «${item.name}» للزبون بحالة «نفد اليوم»؟`)) return;
    await api(`/api/admin/menu/${encodeURIComponent(item.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item, imageData: null, isAvailable })
    });
    await loadMenu();
    setSuccess(isAvailable ? "تمت إعادة الطبق إلى القائمة." : "سيظهر الطبق للزبائن بحالة «نفد اليوم».");
  } catch (error) {
    showMessage(adminMessage, error.message);
  }
}

async function deleteMenuItem(item) {
  if (!window.confirm(`حذف «${item.name}» نهائيًا؟ ستبقى تفاصيل الطلبات السابقة محفوظة.`)) return;
  hideMessage(adminMessage);
  try {
    await api(`/api/admin/menu/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (byId("menu-id").value === item.id) resetMenuForm();
    await loadMenu();
    setSuccess("تم حذف الطبق؛ بقيت تفاصيل الطلبات السابقة محفوظة.");
  } catch (error) {
    showMessage(adminMessage, error.message);
  }
}

function renderStaff() {
  const list = byId("admin-staff-list");
  byId("staff-count").textContent = `${new Intl.NumberFormat("ar-DZ").format(staffAccounts.length)} موظف`;
  list.replaceChildren();
  if (staffAccounts.length === 0) {
    list.append(makeElement("div", "admin-empty", "لم تتم إضافة موظفين بعد."));
    return;
  }

  staffAccounts.forEach((staff) => {
    const card = makeElement("article", `admin-record-card${staff.isActive ? "" : " record-inactive"}`);
    const details = makeElement("div", "record-details");
    details.append(
      makeElement("strong", "staff-record-name", staff.name),
      makeElement("span", "record-subtitle", `أُضيف ${new Date(staff.createdAt).toLocaleDateString("ar-DZ")}`)
    );
    const status = makeElement("span", `record-status${staff.isActive ? " active" : ""}`, staff.isActive ? "نشط" : "موقوف");
    const actions = makeElement("div", "record-actions");
    const edit = makeElement("button", "small-action", "تعديل");
    edit.type = "button";
    edit.addEventListener("click", () => editStaff(staff));
    const toggle = makeElement("button", "small-action", staff.isActive ? "تعطيل" : "إعادة التفعيل");
    toggle.type = "button";
    toggle.addEventListener("click", () => setStaffAvailability(staff, !staff.isActive));
    actions.append(edit, toggle);
    card.append(details, status, actions);
    list.append(card);
  });
}

function resetStaffForm() {
  byId("staff-form").reset();
  byId("staff-id").value = "";
  byId("staff-form-title").textContent = "إضافة موظف";
  byId("staff-submit").textContent = "إضافة الموظف";
  byId("staff-pin-label").classList.remove("hidden");
  byId("staff-pin-help").textContent = "اختر رمزًا فريدًا من 6 إلى 12 رقمًا، ثم أبلغه للموظف بأمان.";
  byId("staff-pin-input").required = true;
  byId("staff-pin-input").placeholder = "6 إلى 12 رقمًا";
  byId("staff-active-label").classList.add("hidden");
  byId("staff-active").checked = true;
  byId("staff-cancel").classList.add("hidden");
}

function editStaff(staff) {
  byId("staff-id").value = staff.id;
  byId("staff-name").value = staff.name;
  byId("staff-pin-input").value = "";
  byId("staff-pin-input").required = false;
  byId("staff-pin-input").placeholder = "اتركه فارغًا للإبقاء على الرمز";
  byId("staff-pin-help").textContent = "اترك حقل الرمز فارغًا للإبقاء عليه، أو أدخل رمزًا جديدًا فريدًا.";
  byId("staff-active").checked = staff.isActive;
  byId("staff-active-label").classList.remove("hidden");
  byId("staff-form-title").textContent = "تعديل حساب الموظف";
  byId("staff-submit").textContent = "حفظ التعديلات";
  byId("staff-cancel").classList.remove("hidden");
  byId("staff-name").focus();
}

async function loadStaff() {
  staffAccounts = await api("/api/admin/staff");
  renderStaff();
  const filter = byId("orders-staff-filter");
  const selectedStaffId = filter.value;
  filter.replaceChildren(new Option("جميع الموظفين", ""));
  staffAccounts.forEach((staff) => filter.add(new Option(staff.name, String(staff.id))));
  if ([...filter.options].some((option) => option.value === selectedStaffId)) {
    filter.value = selectedStaffId;
  }
}

async function setStaffAvailability(staff, isActive) {
  hideMessage(adminMessage);
  try {
    if (!isActive && !window.confirm(`تعطيل حساب «${staff.name}»؟ سيُطلب منه تسجيل الدخول مجددًا بعد إعادة تفعيله.`)) return;
    await api(`/api/admin/staff/${staff.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: staff.name, isActive, newPin: null })
    });
    await loadStaff();
    setSuccess(isActive ? "تم تفعيل الحساب." : "تم تعطيل الحساب وإلغاء جلساته.");
  } catch (error) {
    showMessage(adminMessage, error.message);
  }
}

function renderOrders(orders) {
  const list = byId("admin-orders-list");
  list.replaceChildren();
  if (orders.length === 0) {
    list.append(makeElement("div", "admin-empty", "لا توجد طلبات منجزة تطابق المرشحات."));
    return;
  }

  orders.forEach((order) => {
    const card = makeElement("button", "admin-order-card");
    card.type = "button";
    const header = makeElement("div", "admin-order-header");
    header.append(makeElement("strong", "", `طلب ${new Intl.NumberFormat("ar-DZ").format(order.id)}`));
    const orderDetails = [order.customerName];
    if (order.tableNumber != null) {
      orderDetails.push(`الطاولة ${new Intl.NumberFormat("ar-DZ").format(order.tableNumber)}`);
    }
    orderDetails.push(`أُنجز ${formatOrderDate(order.confirmedAt)}`);
    if (order.staffName) orderDetails.push(order.staffName);
    const meta = makeElement("div", "admin-order-meta", orderDetails.join(" · "));
    const total = makeMoneyElement(order.total, "strong", "admin-order-total");
    card.append(header, meta, total);
    card.addEventListener("click", () => { void showOrderTicket(order); });
    list.append(card);
  });
}

function formatOrderDate(value) {
  if (!value) return "غير مسجل";
  return new Date(value).toLocaleString("ar-DZ", { dateStyle: "medium", timeStyle: "short" });
}

function getLocalDateRange(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const from = new Date(year, month - 1, day);
  const to = new Date(year, month - 1, day + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function showOrderTicket(order) {
  hideMessage(adminMessage);
  try {
    const details = await api(`/api/admin/orders/${order.id}`);
    byId("ticket-title").textContent = `طلب ${new Intl.NumberFormat("ar-DZ").format(details.id)}`;
    const meta = byId("ticket-meta");
    meta.replaceChildren();
    [
      `الزبون: ${details.customerName}`,
      details.tableNumber == null ? null : `الطاولة: ${new Intl.NumberFormat("ar-DZ").format(details.tableNumber)}`,
      `وقت إنشاء الطلب: ${formatOrderDate(details.createdAt)}`,
      `وقت التأكيد: ${formatOrderDate(details.confirmedAt)}`,
      `الموظف: ${details.staffName || "غير مسجل — تم تأكيده قبل تفعيل تسجيل الموظف"}`,
      details.notes ? `ملاحظة الطلب: ${details.notes}` : null
    ].filter(Boolean).forEach((detail) => meta.append(makeElement("p", "", detail)));

    const items = byId("ticket-items");
    items.replaceChildren();
    details.items.forEach((item) => {
      const row = makeElement("div", "ticket-item");
      const name = makeElement("div", "ticket-item-name");
      if (item.imageData) {
        const image = makeElement("img", "order-item-photo");
        image.src = item.imageData;
        image.alt = "";
        image.addEventListener("error", () => {
          image.replaceWith(makeElement("span", "order-item-placeholder", "🍽"));
        }, { once: true });
        name.append(image);
      } else {
        name.append(makeElement("span", "order-item-placeholder", "🍽"));
      }
      const itemCopy = makeElement("div", "ticket-item-copy");
      itemCopy.append(makeElement("span", "ticket-item-label", `${item.name} × ${new Intl.NumberFormat("ar-DZ").format(item.quantity)}`));
      if (item.notes) itemCopy.append(makeElement("span", "ticket-item-note", item.notes));
      name.append(itemCopy);
      row.append(name, makeMoneyElement(item.subtotal));
      items.append(row);
    });
    byId("ticket-total").textContent = `${new Intl.NumberFormat("ar-DZ").format(details.total)} درهم`;
    byId("admin-order-ticket").showModal();
  } catch (error) {
    showMessage(adminMessage, error.message);
  }
}

function renderOrderStats(stats) {
  const staffTotal = staffAccounts.length;
  const activeStaff = staffAccounts.filter((staff) => staff.isActive).length;
  const cards = [
    ["الموظفون النشطون", `${new Intl.NumberFormat("ar-DZ").format(activeStaff)} / ${new Intl.NumberFormat("ar-DZ").format(staffTotal)}`],
    ["الطلبات المنجزة اليوم", new Intl.NumberFormat("ar-DZ").format(stats.completedOrders)],
    ["قيمة الطلبات المنجزة اليوم", `${new Intl.NumberFormat("ar-DZ").format(stats.revenue)} درهم`]
  ];
  const summary = byId("admin-order-stats");
  summary.replaceChildren();
  cards.forEach(([label, value]) => {
    const card = makeElement("article", "order-stat-card");
    card.append(makeElement("span", "", label), makeElement("strong", "", value));
    summary.append(card);
  });

  const employeeList = byId("admin-employee-stats");
  employeeList.replaceChildren();
  if (stats.employees.length === 0) {
    employeeList.append(makeElement("div", "admin-empty", "لا توجد حسابات موظفين."));
  } else {
    stats.employees.forEach((employee) => {
      const card = makeElement("article", "employee-stat-card");
      const heading = makeElement("div", "employee-stat-heading");
      heading.append(
        makeElement("strong", "", employee.name),
        makeElement("span", "record-status", employee.isActive ? "نشط" : "معطل")
      );
      card.append(
        heading,
        makeElement("span", "", `${new Intl.NumberFormat("ar-DZ").format(employee.completedOrders)} طلب`),
        makeElement("strong", "", `${new Intl.NumberFormat("ar-DZ").format(employee.revenue)} درهم`)
      );
      employeeList.append(card);
    });
  }

  const note = byId("unattributed-orders-note");
  if (stats.unattributedOrders > 0) {
    note.textContent = `${new Intl.NumberFormat("ar-DZ").format(stats.unattributedOrders)} طلبًا منجزًا في هذا اليوم لا يملك اسم موظف محفوظًا من النظام السابق.`;
    note.classList.remove("hidden");
  } else {
    note.textContent = "";
    note.classList.add("hidden");
  }
}

async function loadOrders() {
  byId("admin-orders-list").replaceChildren(makeElement("div", "admin-empty", "جارٍ تحميل الطلبات..."));
  const query = new URLSearchParams();
  const selectedStaffId = byId("orders-staff-filter").value;
  const selectedDate = byId("orders-date-filter").value;
  if (selectedStaffId) query.set("staffId", selectedStaffId);
  if (selectedDate) {
    const range = getLocalDateRange(selectedDate);
    query.set("from", range.from);
    query.set("to", range.to);
  }
  const orders = await api(`/api/admin/orders${query.size ? `?${query}` : ""}`);
  renderOrders(orders);
}

async function loadOrderStats() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const query = new URLSearchParams({
    from: from.toISOString().replace(/\.\d{3}Z$/, "Z"),
    to: to.toISOString().replace(/\.\d{3}Z$/, "Z")
  });
  const stats = await api(`/api/admin/order-stats?${query}`);
  renderOrderStats(stats);
}

async function refreshOrders() {
  try {
    await Promise.all([loadOrders(), loadOrderStats()]);
  } catch (error) {
    showMessage(adminMessage, error.message);
  }
}

async function loadWorkspace() {
  hideMessage(adminMessage);
  try {
    await loadStaff();
    await Promise.all([loadMenu(), loadOrders(), loadOrderStats(), loadSiteSettings(), loadAdminProfile()]);
    showWorkspace(true);
  } catch (error) {
    showWorkspace(false);
    showMessage(byId("admin-login-message"), error.message);
  }
}

function showAdminTab(name) {
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    const selected = tab.dataset.adminTab === name;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".admin-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `admin-${name}-panel`);
  });
}

byId("admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  hideMessage(byId("admin-login-message"));
  button.disabled = true;
  try {
    await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: byId("admin-username").value,
        password: byId("admin-password").value
      })
    });
    byId("admin-password").value = "";
    await loadWorkspace();
  } catch (error) {
    showMessage(byId("admin-login-message"), error.message);
  } finally {
    byId("admin-password").value = "";
    button.disabled = false;
  }
});

byId("admin-logout").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
    showWorkspace(false);
    setSuccess("تم تسجيل الخروج.");
  } catch (error) {
    showMessage(adminMessage, error.message);
  }
});

byId("admin-settings-toggle").addEventListener("click", () => {
  const panel = byId("admin-settings-panel");
  const isOpening = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !isOpening);
  byId("admin-dashboard").classList.toggle("hidden", isOpening);
  byId("admin-settings-toggle").setAttribute("aria-expanded", String(isOpening));
  if (isOpening) previewSiteSettings();
});

byId("site-settings-cancel").addEventListener("click", closeSiteSettings);

document.querySelectorAll('input[name="site-theme"]').forEach((input) => {
  input.addEventListener("change", previewSiteSettings);
});

byId("site-name").addEventListener("input", previewSiteSettings);
byId("site-logo-remove").addEventListener("change", previewSiteSettings);

byId("site-logo").addEventListener("change", async (event) => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;

  hideMessage(adminMessage);
  try {
    selectedSiteLogoData = await window.prepareImageData(file);
    byId("site-logo-remove").checked = false;
    showImagePreview("site-logo-preview", "site-logo-placeholder", selectedSiteLogoData, "");
    previewSiteSettings();
  } catch (error) {
    selectedSiteLogoData = null;
    input.value = "";
    showImagePreview("site-logo-preview", "site-logo-placeholder", savedSiteSettings.logoData, "سيظهر الحرف الأول من الاسم افتراضيًا");
    showMessage(adminMessage, error.message);
  }
});

byId("site-settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const selected = document.querySelector('input[name="site-theme"]:checked');
  const siteName = byId("site-name").value.trim();
  if (!selected || !siteName) return;

  const button = byId("site-settings-save");
  button.disabled = true;
  hideMessage(adminMessage);
  try {
    const settings = await api("/api/admin/site-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: selected.value,
        siteName,
        logoData: byId("site-logo-remove").checked ? null : selectedSiteLogoData,
        removeLogo: byId("site-logo-remove").checked
      })
    });
    savedSiteSettings = settings;
    selectedSiteLogoData = null;
    byId("site-logo").value = "";
    showImagePreview("site-logo-preview", "site-logo-placeholder", settings.logoData, "سيظهر الحرف الأول من الاسم افتراضيًا");
    window.applySiteSettings(settings);
    setSuccess("تم حفظ إعدادات الموقع.");
  } catch (error) {
    showMessage(adminMessage, error.message);
  } finally {
    button.disabled = false;
  }
});

byId("admin-profile-image").addEventListener("change", async (event) => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;

  hideMessage(adminMessage);
  try {
    selectedAdminAvatarData = await window.prepareImageData(file);
    byId("admin-profile-image-remove").checked = false;
    showImagePreview("admin-profile-preview", "admin-profile-placeholder", selectedAdminAvatarData, "");
  } catch (error) {
    selectedAdminAvatarData = null;
    input.value = "";
    showImagePreview("admin-profile-preview", "admin-profile-placeholder", savedAdminProfile.avatarData, "اختر صورة شخصية");
    showMessage(adminMessage, error.message);
  }
});

byId("admin-profile-image-remove").addEventListener("change", () => {
  if (byId("admin-profile-image-remove").checked) {
    selectedAdminAvatarData = null;
    byId("admin-profile-image").value = "";
  }
  const avatarData = byId("admin-profile-image-remove").checked
    ? null
    : selectedAdminAvatarData ?? savedAdminProfile.avatarData;
  showImagePreview("admin-profile-preview", "admin-profile-placeholder", avatarData, "اختر صورة شخصية");
});

byId("admin-profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = byId("admin-profile-save");
  button.disabled = true;
  hideMessage(adminMessage);
  try {
    savedAdminProfile = await api("/api/admin/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: byId("admin-profile-name").value.trim(),
        avatarData: byId("admin-profile-image-remove").checked ? null : selectedAdminAvatarData,
        removeAvatar: byId("admin-profile-image-remove").checked
      })
    });
    selectedAdminAvatarData = null;
    byId("admin-profile-image").value = "";
    byId("admin-profile-image-remove").checked = false;
    showImagePreview("admin-profile-preview", "admin-profile-placeholder", savedAdminProfile.avatarData, "اختر صورة شخصية");
    updateAdminAvatar(savedAdminProfile);
    setSuccess("تم حفظ الملف الشخصي للمدير.");
  } catch (error) {
    showMessage(adminMessage, error.message);
  } finally {
    button.disabled = false;
  }
});

byId("admin-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = byId("admin-password-save");
  button.disabled = true;
  hideMessage(adminMessage);
  try {
    await api("/api/admin/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: byId("admin-current-password").value,
        newPassword: byId("admin-new-password").value
      })
    });
    byId("admin-password-form").reset();
    showWorkspace(false);
    showMessage(byId("admin-login-message"), "تم تغيير كلمة المرور. سجّل الدخول باستخدام كلمة المرور الجديدة.");
  } catch (error) {
    showMessage(adminMessage, error.message);
  } finally {
    button.disabled = false;
  }
});

byId("menu-image").addEventListener("change", async (event) => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) {
    selectedMenuImageData = null;
    showMenuImagePreview(currentMenuImageData, "اختر صورة واضحة للطبق");
    return;
  }

  hideMessage(adminMessage);
  try {
    selectedMenuImageData = await window.prepareImageData(file);
    showMenuImagePreview(selectedMenuImageData, "");
  } catch (error) {
    selectedMenuImageData = null;
    input.value = "";
    showMenuImagePreview(currentMenuImageData, "اختر صورة واضحة للطبق");
    showMessage(adminMessage, error.message);
  }
});

byId("menu-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = byId("menu-id").value;
  const payload = {
    name: byId("menu-name").value,
    description: byId("menu-description").value,
    category: byId("menu-category").value,
    price: Number(byId("menu-price").value),
    imageData: selectedMenuImageData,
    isAvailable: byId("menu-available").checked,
    translations: {
      ar: {
        name: byId("menu-name").value,
        description: byId("menu-description").value,
        category: byId("menu-category").value,
        allergens: byId("menu-allergens-ar").value
      },
      fr: {
        name: byId("menu-name-fr").value,
        description: byId("menu-description-fr").value,
        category: byId("menu-category-fr").value,
        allergens: byId("menu-allergens-fr").value
      },
      en: {
        name: byId("menu-name-en").value,
        description: byId("menu-description-en").value,
        category: byId("menu-category-en").value,
        allergens: byId("menu-allergens-en").value
      }
    },
    badges: [
      byId("menu-badge-popular").checked ? "popular" : null,
      byId("menu-badge-new").checked ? "new" : null,
      byId("menu-badge-spicy").checked ? "spicy" : null,
      byId("menu-badge-vegetarian").checked ? "vegetarian" : null
    ].filter(Boolean)
  };
  const button = byId("menu-submit");
  button.disabled = true;
  hideMessage(adminMessage);
  try {
    await api(id ? `/api/admin/menu/${encodeURIComponent(id)}` : "/api/admin/menu", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    resetMenuForm();
    await loadMenu();
    setSuccess(id ? "تم حفظ تعديلات الطبق." : "تمت إضافة الطبق إلى القائمة.");
  } catch (error) {
    showMessage(adminMessage, error.message);
  } finally {
    button.disabled = false;
  }
});

byId("menu-cancel").addEventListener("click", resetMenuForm);
byId("staff-cancel").addEventListener("click", resetStaffForm);

byId("staff-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = byId("staff-id").value;
  const button = byId("staff-submit");
  button.disabled = true;
  hideMessage(adminMessage);
  try {
    if (id) {
      await api(`/api/admin/staff/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: byId("staff-name").value,
          isActive: byId("staff-active").checked,
          newPin: byId("staff-pin-input").value || null
        })
      });
    } else {
      await api("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: byId("staff-name").value, pin: byId("staff-pin-input").value })
      });
    }
    resetStaffForm();
    await loadStaff();
    setSuccess(id ? "تم تحديث حساب الموظف." : "تمت إضافة الموظف. أبلغه رمز الدخول بأمان.");
  } catch (error) {
    showMessage(adminMessage, error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll(".admin-tab").forEach((tab) => {
  tab.addEventListener("click", async () => {
    showAdminTab(tab.dataset.adminTab);
    if (tab.dataset.adminTab === "orders") {
      await refreshOrders();
    }
  });
});

byId("refresh-orders").addEventListener("click", refreshOrders);
byId("orders-staff-filter").addEventListener("change", refreshOrders);
byId("orders-date-filter").addEventListener("change", refreshOrders);
byId("clear-orders-filters").addEventListener("click", () => {
  byId("orders-staff-filter").value = "";
  byId("orders-date-filter").value = "";
  refreshOrders();
});
byId("ticket-close").addEventListener("click", () => byId("admin-order-ticket").close());
byId("admin-order-ticket").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

fetch("/api/admin/me", { credentials: "same-origin" })
  .then((response) => {
    if (response.ok) return loadWorkspace();
    showWorkspace(false);
    if (response.status === 403) {
      showMessage(byId("admin-login-message"), "الجلسة الحالية ليست جلسة مدير. أدخل بيانات المدير للمتابعة.");
      return;
    }
    if (response.status !== 401) {
      showMessage(byId("admin-login-message"), "تعذّر تحميل لوحة الإدارة. أعد المحاولة.");
    }
  })
  .catch(() => {
    showWorkspace(false);
    showMessage(byId("admin-login-message"), "تعذّر الاتصال بالخادم. أعد تحميل الصفحة أو تحقق من الاتصال.");
  });
