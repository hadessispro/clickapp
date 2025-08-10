// Lắng nghe sự kiện click vào khu vực "video"
document.getElementById("location-trigger").addEventListener("click", () => {
  console.log("Khu vực video được click, chuẩn bị hỏi quyền vị trí...");
  requestLocationPermission();
});

function requestLocationPermission() {
  // Kiểm tra xem trình duyệt có hỗ trợ Geolocation không
  if ("geolocation" in navigator) {
    // Nếu có, gọi hàm để lấy vị trí
    // Hàm này sẽ tự động bật pop-up của trình duyệt
    navigator.geolocation.getCurrentPosition(successCallback, errorCallback);
  } else {
    alert("Rất tiếc, trình duyệt của bạn không hỗ trợ lấy vị trí.");
  }
}

// Hàm được gọi khi người dùng ĐỒNG Ý cấp quyền
function successCallback(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;

  // Console ra để bạn kiểm tra trước
  console.log(`Vị trí chính xác đã lấy được: ${lat}, ${lon}`);

  // DÙNG FETCH ĐỂ GỬI TỌA ĐỘ LÊN SERVER
  // Chúng ta sẽ tạo một API mới trên server tên là 'log-precise-location'
  fetch("/api/log-precise-location", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    // Gửi tọa độ đi trong body của request
    body: JSON.stringify({ latitude: lat, longitude: lon }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Server responded with an error");
      }
      return response.json();
    })
    .then((data) => {
      console.log("Phản hồi từ server:", data);
    })
    .catch((error) => {
      console.error("Lỗi khi gửi vị trí lên server:", error);
    });
}

// Hàm được gọi khi người dùng TỪ CHỐI cấp quyền hoặc có lỗi
function errorCallback(error) {
  console.log(`Có lỗi xảy ra: ${error.message}`);
  switch (error.code) {
    case error.PERMISSION_DENIED:
      alert(
        "Bạn đã từ chối cấp quyền vị trí. Chúng tôi không thể đề xuất các địa điểm gần bạn."
      );
      break;
    case error.POSITION_UNAVAILABLE:
      alert("Không thể xác định được vị trí của bạn.");
      break;
    case error.TIMEOUT:
      alert("Yêu cầu lấy vị trí đã hết hạn.");
      break;
    default:
      alert("Một lỗi không xác định đã xảy ra.");
      break;
  }
}
