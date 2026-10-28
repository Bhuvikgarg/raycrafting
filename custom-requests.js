(function () {
  var states = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"];
  var cities = ["Ahmedabad", "Agartala", "Agra", "Aizawl", "Amaravati", "Amritsar", "Bengaluru", "Bhopal", "Bhubaneswar", "Chandigarh", "Chennai", "Coimbatore", "Dehradun", "Delhi", "Dispur", "Faridabad", "Gangtok", "Gandhinagar", "Ghaziabad", "Gurugram", "Guwahati", "Gwalior", "Hyderabad", "Imphal", "Indore", "Itanagar", "Jaipur", "Jammu", "Jodhpur", "Kanpur", "Kochi", "Kohima", "Kolkata", "Kota", "Lucknow", "Ludhiana", "Madurai", "Mangaluru", "Meerut", "Mumbai", "Mysuru", "Nagpur", "Nashik", "Noida", "Panaji", "Patna", "Port Blair", "Pune", "Raipur", "Rajkot", "Ranchi", "Shillong", "Shimla", "Siliguri", "Srinagar", "Surat", "Thane", "Thiruvananthapuram", "Udaipur", "Vadodara", "Varanasi", "Vijayawada", "Visakhapatnam", "Other city / town"];
  var byId = function (id) { return document.getElementById(id); };
  var fill = function (id, values, label) { var select = byId(id); if (!select) return; values.forEach(function (value) { var option = document.createElement("option"); option.value = value; option.textContent = value; select.appendChild(option); }); };
  fill("customState", states, "Choose a state");
  var resizeImage = function (file) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { var image = new Image(); image.onload = function () { var max = 1100; var scale = Math.min(1, max / Math.max(image.width, image.height)); var canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", .78)); }; image.onerror = reject; image.src = reader.result; }; reader.onerror = reject; reader.readAsDataURL(file); }); };
  var submitJson = async function (url, payload) { var response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); var data = await response.json().catch(function () { return {}; }); if (!response.ok) throw new Error(data.error || "Could not send this request."); return data; };
  var customForm = byId("customOrderForm"); var customImage = byId("customImage"); var customImageData = ""; var customStatus = byId("customOrderStatus");
  if (customImage) customImage.addEventListener("change", function () { var file = customImage.files[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { customStatus.textContent = "Please choose an image smaller than 5 MB."; customImage.value = ""; return; } customStatus.textContent = "Preparing your image…"; resizeImage(file).then(function (data) { customImageData = data; byId("customPreviewImage").src = data; byId("customImagePreview").hidden = false; customStatus.textContent = "Image ready to send."; }).catch(function () { customStatus.textContent = "Could not read that image. Please try another one."; }); });
  if (byId("removeCustomImage")) byId("removeCustomImage").addEventListener("click", function () { customImageData = ""; if (customImage) customImage.value = ""; byId("customImagePreview").hidden = true; customStatus.textContent = ""; });
  if (customForm) customForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = customForm.querySelector("button[type=submit]");
    button.disabled = true;
    button.classList.add("is-loading");
    customStatus.textContent = "Sending your idea…";
    try {
      var data = await submitJson("/api/custom-orders", {
        name: byId("customName").value.trim(),
        email: byId("customEmail").value.trim(),
        phone: byId("customPhone").value.trim(),
        city: byId("customCity").value.trim(),
        state: byId("customState").value,
        description: byId("customDescription").value.trim(),
        referenceImage: customImageData,
        askPrice: byId("customAskPrice") ? byId("customAskPrice").checked : true,
        budgetHint: byId("customBudget") ? byId("customBudget").value.trim() : ""
      });
      customStatus.textContent = data.message || "Your custom idea has been sent.";
      customForm.reset();
      customImageData = "";
      byId("customImagePreview").hidden = true;
    } catch (error) {
      customStatus.textContent = error.message;
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  });
}());
