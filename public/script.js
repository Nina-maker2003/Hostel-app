let passwordTimer = null;
let extendPasswordTimer = null;
let menuOpen = false;

function toggleMenu() {
  menuOpen = !menuOpen;
  document.getElementById('menuContainer').style.display = menuOpen ? 'block' : 'none';
  
  // Change menu button visibility
  const menuButton = document.getElementById('menuButton');
  if (menuOpen) {
    // Just make button transparent when menu is open (maintain position)
    menuButton.style.opacity = '0';
    menuButton.style.pointerEvents = 'none';
  } else {
    // Restore button when menu is closed
    menuButton.style.opacity = '1';
    menuButton.style.pointerEvents = 'auto';
  }
}

function changePage(pageId) {
  // Deactivate all pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  // Deactivate all menu items
  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // Activate selected page
  document.getElementById(pageId).classList.add('active');
  
  // Activate corresponding menu item
  if (pageId === 'passwordPage') {
    document.querySelectorAll('.menu-item')[0].classList.add('active');
  } else if (pageId === 'extendStayPage') {
    document.querySelectorAll('.menu-item')[1].classList.add('active');
  } else if (pageId === 'requestsPage') {
    document.querySelectorAll('.menu-item')[2].classList.add('active');
    // Hide all subpages when navigating to the requests page
    hideRequestSubpages();
  }
  
  // Close menu
  menuOpen = false;
  document.getElementById('menuContainer').style.display = 'none';
  
  // Restore menu button
  const menuButton = document.getElementById('menuButton');
  menuButton.style.opacity = '1';
  menuButton.style.pointerEvents = 'auto';
}

function closeMenuOnOutsideClick(event) {
  if (event.target === document.getElementById('menuContainer')) {
    toggleMenu();
  }
}

// Show request subpage
function showRequestSubpage(pageType) {
  // Hide all subpages
  hideRequestSubpages();
  
  // Show specified subpage
  if (pageType === 'cleaning') {
    document.getElementById('cleaningPage').style.display = 'block';
  } else if (pageType === 'other') {
    document.getElementById('otherPage').style.display = 'block';
  }
  
  // Hide request buttons
  document.querySelector('.request-buttons').style.display = 'none';
}

// Hide all request subpages
function hideRequestSubpages() {
  document.querySelectorAll('.request-subpage').forEach(page => {
    page.style.display = 'none';
  });
  
  // Show request buttons
  document.querySelector('.request-buttons').style.display = 'grid';
}

// Submit extend stay request(延泊リクエスト)
// 仕様変更の影響でextendReservationNumberのままになっているが実際はメールアドレス
async function submitExtendStayRequest() {
  const reservationNumber = document.getElementById('extendReservationNumber').value.trim();
  const roomNumber = document.getElementById('extendRoomNumber').value.trim();
  const resultDiv = document.getElementById('extendStayResult');
  
  // Input validation
  if (!reservationNumber || !roomNumber) {
    resultDiv.innerHTML = '全ての項目を入力してください / Please fill in all fields';
    resultDiv.className = 'error';
    return;
  }
  
  // Sending message
  resultDiv.innerHTML = '送信中... / Sending...';
  resultDiv.className = '';
  
  try {
    const response = await fetch('/api/extendStay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reservationNumber, roomNumber }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      resultDiv.innerHTML = 'リクエストを送信しました。ありがとうございます。 / Your request has been sent. Thank you.';
      resultDiv.className = 'success';
      // Clear input fields
      document.getElementById('extendReservationNumber').value = '';
      document.getElementById('extendRoomNumber').value = '';
      
      // Hide message after 5 seconds
      setTimeout(() => {
        resultDiv.innerHTML = '';
        resultDiv.className = '';
      }, 5000);
    } else {
      resultDiv.innerHTML = '送信に失敗しました。後でもう一度お試しください。 / Submission failed. Please try again later.';
      resultDiv.className = 'error';
    }
  } catch (error) {
    resultDiv.innerHTML = 'エラーが発生しました。後でもう一度お試しください。 / An error occurred. Please try again later.';
    resultDiv.className = 'error';
  }
}

// Check credentials for password(Backdoor)
async function checkCredentials() {
  const reservationNumber = document.getElementById('name').value.trim();
  const roomNumber = document.getElementById('roomNumber').value.trim();
  const loadingDiv = document.getElementById('loading');
  const resultDiv = document.getElementById('result');
  
  // Clear result display
  resultDiv.innerHTML = '';
  resultDiv.className = '';
  
  if (!reservationNumber || !roomNumber) {
    showMessage('全ての項目を入力してください / Please fill in all fields', 'error');
    return;
  }
  
  // Clear existing timer
  if (passwordTimer) {
    clearTimeout(passwordTimer);
    passwordTimer = null;
  }
  
  // Show loading indicator
  loadingDiv.style.display = 'block';
  
  // Clear input fields
  document.getElementById('name').value = '';
  document.getElementById('roomNumber').value = '';
  
  try {
    const response = await fetch('/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: reservationNumber, roomNumber }),
    });
    
    const data = await response.json();
    loadingDiv.style.display = 'none'; // Hide loading
    
    if (data.isValid) {
      await showPassword();
    } else {
      showMessage('入力情報が正しくありません / Information is incorrect', 'error');
    }
  } catch (error) {
    loadingDiv.style.display = 'none'; // Hide loading
    showError();
  }
}

// Get and display password
async function showPassword() {
  const resultDiv = document.getElementById('result');
  
  try {
    const response = await fetch('/api/password');
    const data = await response.json();
    
    resultDiv.innerHTML = `
      <div class="success-message">
        今週の裏口パスワード: <strong>${data.password}</strong>
      </div>
    `;
    resultDiv.className = 'success';
    
    passwordTimer = setTimeout(() => {
      resultDiv.innerHTML = '';
      resultDiv.className = '';
    }, 7000);
  } catch (error) {
    showError();
  }
}

// Add the showMessage function
function showMessage(message, type) {
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = message;
  resultDiv.className = type;
  
  // Clear the message after some time (optional)
  if (passwordTimer) {
    clearTimeout(passwordTimer);
  }
  
  passwordTimer = setTimeout(() => {
    resultDiv.innerHTML = '';
    resultDiv.className = '';
  }, 6000);
}

// Add the showError function(server related error, APIやinternetなど) 
function showError() {
  showMessage('エラーが発生しました。後でもう一度お試しください。 / An error occurred. Please try again later.', 'error');
}


// Toggle feedback form
function toggleFeedbackForm() {
  const feedbackForm = document.getElementById('feedbackForm');
  if (feedbackForm.style.display === 'none') {
    feedbackForm.style.display = 'block';
  } else {
    feedbackForm.style.display = 'none';
  }
}

// Submit feedback
async function submitFeedback() {
  const feedbackText = document.getElementById('feedbackText').value.trim();
  const feedbackResult = document.getElementById('feedbackResult');
  
  if (!feedbackText) {
    feedbackResult.innerHTML = 'フィードバックを入力してください / Please enter your feedback';
    feedbackResult.className = 'error';
    return;
  }
  
  feedbackResult.innerHTML = '送信中... / Sending...';
  feedbackResult.className = '';
  
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ feedbackText }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      feedbackResult.innerHTML = 'フィードバックを送信しました。ありがとうございます。 / Your feedback has been sent. Thank you.';
      feedbackResult.className = 'success';
      document.getElementById('feedbackText').value = '';
      
      // Hide message after 5 seconds
      setTimeout(() => {
        feedbackResult.innerHTML = '';
        feedbackResult.className = '';
        document.getElementById('feedbackForm').style.display = 'none';
      }, 5000);
    } else {
      feedbackResult.innerHTML = '送信に失敗しました。後でもう一度お試しください。 / Submission failed. Please try again later.';
      feedbackResult.className = 'error';
    }
  } catch (error) {
    feedbackResult.innerHTML = 'エラーが発生しました。後でもう一度お試しください。 / An error occurred. Please try again later.';
    feedbackResult.className = 'error';
  }
}