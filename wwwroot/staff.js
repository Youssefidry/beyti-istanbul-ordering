const byId = (id) => document.getElementById(id);
const loginPanel = byId("staff-login");
const workspace = byId("staff-workspace");
const staffMessage = byId("staff-message");
let scanner;
let currentOrderToken = "";
let savedStaffProfile = { name: "", avatarData: null };
let selectedStaffAvatarData = null;

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
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

function showMessage(element, text) {
  element.textContent = text;
  element.classList.remove("hidden");
}

function hideMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      showWorkspace(false);
    }
    const message = response.status === 429
      ? "محاولات كثيرة. انتظر قليلًا قبل إعادة المحاولة."
      : data?.message || (response.status === 401 ? "انتهت الجلسة أو رمز الموظف غير صحيح؛ سجّل الدخول مجددًا." : "تعذّر تنفيذ الطلب.");
    throw new Error(message);
  }
  return data;
}

function showStaffImagePreview(imageData, placeholderText) {
  const image = byId("staff-profile-preview");
  const placeholder = byId("staff-profile-placeholder");
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

function renderStaffProfile(profile) {
  if (!profile || typeof profile.name !== "string") {
    throw new Error("تعذّر تحميل ملف الموظف.");
  }
  savedStaffProfile = profile;
  byId("staff-profile-name").value = profile.name;
  byId("staff-profile-image").value = "";
  byId("staff-profile-image-remove").checked = false;
  selectedStaffAvatarData = null;
  showStaffImagePreview(profile.avatarData, "اختر صورة شخصية");

  const avatar = byId("staff-avatar");
  avatar.replaceChildren();
  if (profile.avatarData) {
    const image = makeElement("img", "staff-avatar-image");
    image.src = profile.avatarData;
    image.alt = "";
    avatar.append(image);
  } else {
    avatar.textContent = Array.from(profile.name)[0] || "م";
  }
  byId("staff-display-name").textContent = profile.name;
}

function closeStaffSettings() {
  byId("staff-settings-panel").classList.add("hidden");
  byId("staff-dashboard").classList.remove("hidden");
  byId("staff-settings-toggle").setAttribute("aria-expanded", "false");
  if (savedStaffProfile.name) renderStaffProfile(savedStaffProfile);
  byId("staff-pin-form").reset();
  hideMessage(byId("staff-settings-message"));
  hideMessage(byId("staff-settings-success"));
}

function showWorkspace(authenticated) {
  if (!authenticated) closeStaffSettings();
  byId("staff-intro").classList.toggle("hidden", authenticated);
  loginPanel.classList.toggle("hidden", authenticated);
  workspace.classList.toggle("hidden", !authenticated);
}

function setStaffSettingsSuccess(message) {
  hideMessage(byId("staff-settings-message"));
  showMessage(byId("staff-settings-success"), message);
  window.setTimeout(() => hideMessage(byId("staff-settings-success")), 3500);
}

async function stopScanner() {
  if (!scanner) return;
  try {
    if (scanner.isScanning) await scanner.stop();
  } catch {
    // The lookup can continue if a camera was already stopped.
  }
  scanner.clear();
  scanner = null;
}

function tokenFromScan(value) {
  const text = value.trim();
  if (/^[A-Za-z0-9_-]{20,128}$/.test(text)) return text;
  try {
    const url = new URL(text, window.location.origin);
    const match = url.pathname.match(/^\/order\/([A-Za-z0-9_-]{20,128})\/?$/);
    return url.origin === window.location.origin && match ? match[1] : null;
  } catch {
    return null;
  }
}

function renderOrder(order) {
  currentOrderToken = order.token;
  const result = byId("order-result");
  result.className = "staff-card order-result";

  const statusText = order.status === "confirmed" ? "تم التأكيد" : "بانتظار التأكيد";
  const heading = makeElement("div", "order-result-head");
  const title = makeElement("div");
  title.append(
    makeElement("div", "eyebrow", "مراجعة الطلب"),
    makeElement("h2", "", `طلب ${new Intl.NumberFormat("ar-DZ").format(order.id)}`)
  );
  heading.append(title, makeElement("span", `order-status${order.status === "confirmed" ? " confirmed" : ""}`, statusText));

  const details = makeElement("div", "order-details");
  const orderDetails = [
    ["اسم الزبون", order.customerName],
    ["وقت الطلب", new Date(order.createdAt).toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" })],
    ["التحقق", "رمز صالح من النظام"]
  ];
  if (order.tableNumber != null) {
    orderDetails.splice(1, 0, ["رقم الطاولة", new Intl.NumberFormat("ar-DZ").format(order.tableNumber)]);
  }
  orderDetails.forEach(([label, value]) => {
    const cell = makeElement("div");
    cell.append(makeElement("span", "detail-label", label), makeElement("span", "detail-value", value));
    details.append(cell);
  });

  const items = makeElement("div", "order-lines");
  order.items.forEach((item) => {
    const row = makeElement("div", "order-line");
    row.append(makeElement("span", "", `${item.name} × ${new Intl.NumberFormat("ar-DZ").format(item.quantity)}`));
    row.append(makeMoneyElement(item.subtotal, "strong"));
    items.append(row);
  });
  const total = makeElement("div", "order-result-total");
  total.append(makeElement("span", "", "المجموع"), makeMoneyElement(order.total, "strong"));

  result.replaceChildren(heading, details, items, total);
  if (order.status === "confirmed") {
    result.append(makeElement("div", "order-confirmed-note", "تم تأكيد هذا الطلب مسبقًا، ولا يمكن اعتماده مرة أخرى."));
    return;
  }

  const confirmButton = makeElement("button", "primary-button confirm-order", "تأكيد الطلب");
  confirmButton.type = "button";
  confirmButton.append(document.createTextNode(" ✓"));
  confirmButton.addEventListener("click", confirmOrder);
  result.append(confirmButton);
}

async function lookupOrder(token) {
  hideMessage(staffMessage);
  const normalizedToken = tokenFromScan(token);
  if (!normalizedToken) {
    showMessage(staffMessage, "رمز غير صالح. امسح رمز طلب من سفرة أو الصق رابطه.");
    return;
  }

  try {
    const order = await api(`/api/staff/orders/${encodeURIComponent(normalizedToken)}`);
    renderOrder(order);
  } catch (error) {
    showMessage(staffMessage, error.message);
  }
}

async function confirmOrder() {
  if (!currentOrderToken || !window.confirm("هل تحققت من اسم الزبون والأطباق وتريد اعتماد هذا الطلب؟")) return;
  const button = document.querySelector(".confirm-order");
  button.disabled = true;
  button.textContent = "جارٍ التأكيد...";

  try {
    await api(`/api/staff/orders/${encodeURIComponent(currentOrderToken)}/confirm`, { method: "POST" });
    const updatedOrder = await api(`/api/staff/orders/${encodeURIComponent(currentOrderToken)}`);
    renderOrder(updatedOrder);
  } catch (error) {
    showMessage(staffMessage, error.message);
    button.disabled = false;
    button.textContent = "تأكيد الطلب";
  }
}

byId("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = byId("login-message");
  hideMessage(message);
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await api("/api/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: byId("staff-pin").value })
    });
    byId("staff-pin").value = "";
    renderStaffProfile(await api("/api/staff/profile"));
    showWorkspace(true);
  } catch (error) {
    showMessage(message, error.message === "تعذّر تنفيذ الطلب." ? "رمز الموظف غير صحيح." : error.message);
  } finally {
    button.disabled = false;
  }
});

byId("staff-settings-toggle").addEventListener("click", async () => {
  const panel = byId("staff-settings-panel");
  const isOpening = panel.classList.contains("hidden");
  if (isOpening && scanner) {
    await stopScanner();
    byId("scan-button").textContent = "تشغيل الكاميرا ⌖";
  }
  panel.classList.toggle("hidden", !isOpening);
  byId("staff-dashboard").classList.toggle("hidden", isOpening);
  byId("staff-settings-toggle").setAttribute("aria-expanded", String(isOpening));
  if (isOpening) {
    hideMessage(byId("staff-settings-message"));
    hideMessage(byId("staff-settings-success"));
  } else {
    closeStaffSettings();
  }
});

byId("staff-settings-cancel").addEventListener("click", closeStaffSettings);

byId("staff-profile-image").addEventListener("change", async (event) => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;

  hideMessage(byId("staff-settings-message"));
  try {
    selectedStaffAvatarData = await window.prepareImageData(file);
    byId("staff-profile-image-remove").checked = false;
    showStaffImagePreview(selectedStaffAvatarData, "");
  } catch (error) {
    selectedStaffAvatarData = null;
    input.value = "";
    showStaffImagePreview(savedStaffProfile.avatarData, "اختر صورة شخصية");
    showMessage(byId("staff-settings-message"), error.message);
  }
});

byId("staff-profile-image-remove").addEventListener("change", () => {
  if (byId("staff-profile-image-remove").checked) {
    selectedStaffAvatarData = null;
    byId("staff-profile-image").value = "";
  }
  const avatarData = byId("staff-profile-image-remove").checked
    ? null
    : selectedStaffAvatarData ?? savedStaffProfile.avatarData;
  showStaffImagePreview(avatarData, "اختر صورة شخصية");
});

byId("staff-profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = byId("staff-profile-save");
  button.disabled = true;
  hideMessage(byId("staff-settings-message"));
  try {
    const profile = await api("/api/staff/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: byId("staff-profile-name").value.trim(),
        avatarData: byId("staff-profile-image-remove").checked ? null : selectedStaffAvatarData,
        removeAvatar: byId("staff-profile-image-remove").checked
      })
    });
    renderStaffProfile(profile);
    setStaffSettingsSuccess("تم حفظ الملف الشخصي.");
  } catch (error) {
    showMessage(byId("staff-settings-message"), error.message);
  } finally {
    button.disabled = false;
  }
});

byId("staff-pin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentPin = byId("staff-current-pin").value;
  const newPin = byId("staff-new-pin").value;
  if (newPin !== byId("staff-new-pin-confirm").value) {
    showMessage(byId("staff-settings-message"), "تأكيد الرمز الجديد غير مطابق.");
    return;
  }

  const button = byId("staff-pin-save");
  button.disabled = true;
  hideMessage(byId("staff-settings-message"));
  try {
    await api("/api/staff/pin", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPin, newPin })
    });
    showWorkspace(false);
    showMessage(byId("login-message"), "تم تغيير رمز الدخول. سجّل الدخول باستخدام الرمز الجديد.");
  } catch (error) {
    byId("staff-current-pin").value = "";
    showMessage(byId("staff-settings-message"), error.message);
  } finally {
    button.disabled = false;
  }
});

byId("logout-button").addEventListener("click", async () => {
  await stopScanner();
  try {
    await api("/api/staff/logout", { method: "POST" });
  } catch (error) {
    showMessage(staffMessage, error.message);
  }
  currentOrderToken = "";
  byId("order-result").className = "staff-card order-result empty-result";
  byId("order-result").replaceChildren(
    makeElement("div", "empty-result-art", "✳"),
    makeElement("h2", "", "تفاصيل الطلب تظهر هنا"),
    makeElement("p", "", "بعد مسح الرمز، تأكد من اسم الزبون والأطباق قبل التأكيد.")
  );
  showWorkspace(false);
});

byId("menu-qr-button").addEventListener("click", async () => {
  const card = byId("menu-qr-card");
  if (!card.classList.contains("hidden")) {
    card.classList.add("hidden");
    return;
  }
  try {
    const data = await api("/api/staff/menu-qr");
    byId("menu-qr-image").src = data.qrDataUrl;
    byId("menu-qr-link").href = data.qrDataUrl;
    card.classList.remove("hidden");
  } catch (error) {
    showMessage(staffMessage, error.message);
  }
});

byId("lookup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await lookupOrder(byId("order-token").value);
});

byId("scan-button").addEventListener("click", async () => {
  hideMessage(staffMessage);
  if (scanner) {
    await stopScanner();
    byId("scan-button").textContent = "تشغيل الكاميرا ⌖";
    return;
  }
  if (!window.Html5Qrcode) {
    showMessage(staffMessage, "تعذّر تحميل أداة المسح. استخدم خانة إدخال رمز الطلب.");
    return;
  }
  try {
    scanner = new Html5Qrcode("qr-reader");
    byId("scan-button").textContent = "إيقاف الكاميرا";
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 },
      async (decodedText) => {
        const token = tokenFromScan(decodedText);
        if (!token) {
          showMessage(staffMessage, "هذا الرمز لا يحتوي على طلب صالح من سفرة.");
          return;
        }
        await stopScanner();
        byId("scan-button").textContent = "تشغيل الكاميرا ⌖";
        byId("order-token").value = token;
        await lookupOrder(token);
      },
      () => {}
    );
  } catch {
    await stopScanner();
    byId("scan-button").textContent = "تشغيل الكاميرا ⌖";
    showMessage(staffMessage, "لم نتمكن من تشغيل الكاميرا. اسمح بالوصول إليها أو أدخل رمز الطلب يدويًا.");
  }
});

fetch("/api/staff/me", { credentials: "same-origin" })
  .then(async (response) => {
    if (!response.ok) {
      showWorkspace(false);
      return;
    }
    renderStaffProfile(await response.json());
    showWorkspace(true);
  })
  .catch(() => {
    showWorkspace(false);
    showMessage(byId("login-message"), "تعذّر الاتصال بالخادم. أعد تحميل الصفحة أو تحقق من الاتصال.");
  });
