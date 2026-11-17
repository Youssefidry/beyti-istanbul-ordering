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
  window.applySiteSettings(savedSiteSettings);
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
  byId("menu-id").value = item.id;
  byId("menu-name").value = item.name;
  byId("menu-description").value = item.description;
  byId("menu-category").value = item.category;
  byId("menu-price").value = item.price;
  byId("menu-image").value = "";
  byId("menu-image").required = false;
  currentMenuImageData = item.imageData;
  selectedMenuImageData = null;
  showMenuImagePreview(currentMenuImageData, "لا توجد صورة محفوظة؛ اختر صورة للطبق.");
  byId("menu-available").checked = item.isAvailable;
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
    if (!isAvailable && !window.confirm(`هل تريد إيقاف «${item.name}» من قائمة الزبائن؟`)) return;
    await api(`/api/admin/menu/${encodeURIComponent(item.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item, imageData: null, isAvailable })
    });
    await loadMenu();
    setSuccess(isAvailable ? "تمت إعادة الطبق إلى القائمة." : "تم إيقاف الطبق؛ بقي محفوظًا في الطلبات السابقة.");
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
    list.append(makeElement("div", "admin-empty", "لا توجد طلبات محفوظة بعد."));
    return;
  }

  orders.forEach((order) => {
    const card = makeElement("article", "admin-order-card");
    const header = makeElement("div", "admin-order-header");
    const orderLabel = makeElement("strong", "", `طلب ${new Intl.NumberFormat("ar-DZ").format(order.id)}`);
    const status = makeElement("span", `record-status${order.status === "confirmed" ? " active" : ""}`,
      order.status === "confirmed" ? "مؤكد" : "بانتظار التأكيد");
    header.append(orderLabel, status);
    const orderDetails = [order.customerName];
    if (order.tableNumber != null) {
      orderDetails.push(`الطاولة ${new Intl.NumberFormat("ar-DZ").format(order.tableNumber)}`);
    }
    orderDetails.push(new Date(order.createdAt).toLocaleString("ar-DZ"));
    const meta = makeElement("div", "admin-order-meta", orderDetails.join(" · "));
    const items = makeElement("div", "admin-order-items");
    order.items.forEach((item) => {
      items.append(makeElement("span", "", `${item.name} × ${new Intl.NumberFormat("ar-DZ").format(item.quantity)}`));
    });
    const total = makeMoneyElement(order.total, "strong", "admin-order-total");
    card.append(header, meta, items, total);
    list.append(card);
  });
}

async function loadOrders() {
  byId("admin-orders-list").replaceChildren(makeElement("div", "admin-empty", "جارٍ تحميل الطلبات..."));
  const orders = await api("/api/admin/orders");
  renderOrders(orders);
}

async function loadWorkspace() {
  hideMessage(adminMessage);
  try {
    await Promise.all([loadMenu(), loadStaff(), loadOrders(), loadSiteSettings(), loadAdminProfile()]);
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
    isAvailable: byId("menu-available").checked
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
      try {
        await loadOrders();
      } catch (error) {
        showMessage(adminMessage, error.message);
      }
    }
  });
});

byId("refresh-orders").addEventListener("click", async () => {
  try {
    await loadOrders();
  } catch (error) {
    showMessage(adminMessage, error.message);
  }
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
