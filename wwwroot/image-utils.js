(() => {
  window.prepareImageData = async (file) => {
    const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!acceptedTypes.includes(file.type)) {
      throw new Error("اختر صورة بصيغة JPG أو PNG أو WebP.");
    }
    if (file.size > 10_000_000) {
      throw new Error("حجم الصورة كبير؛ اختر صورة أصغر من 10 ميغابايت.");
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error("تعذّر فتح الصورة. اختر ملف صورة صالحًا.");
    }

    try {
      const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("تعذّر تجهيز الصورة.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("تعذّر تجهيز الصورة."));
        }, "image/jpeg", 0.82);
      });
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("تعذّر قراءة الصورة."));
        reader.onerror = () => reject(new Error("تعذّر قراءة الصورة."));
        reader.readAsDataURL(blob);
      });
    } finally {
      bitmap.close();
    }
  };
})();
