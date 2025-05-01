// Authentication handling
const auth = firebase.auth();

// DOM elements
const loginBtn = document.getElementById('login-btn');
const googleSignInBtn = document.getElementById('google-signin-btn');
const logoutBtn = document.getElementById('logout-btn');
const userPanel = document.getElementById('user-panel');
const userEmail = document.getElementById('user-email');
const loginModal = document.getElementById('login-modal');
const closeModalBtn = document.querySelector('.close-modal');
const loginError = document.getElementById('login-error');

// Authentication state
let currentUser = null;

// Configure Google authentication provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({
  hd: 'wpu.edu.ph' // Limit to WPU domain
});

// Initialize authentication state
auth.onAuthStateChanged(user => {
  if (user) {
    // User is signed in
    if (user.email.endsWith('@wpu.edu.ph')) {
      // Valid WPU email
      loginBtn.classList.add('hidden');
      userPanel.classList.remove('hidden');
      userEmail.textContent = user.email;
      currentUser = user;
      
      // Hide modal if it's open
      hideModal();
      
      // Show login success message with blue styling
      showMessage('Successfully signed in as ' + user.email, 'login-success');
    } else {
      // Not a WPU email - sign out
      showMessage('Please use a valid WPU email address (@wpu.edu.ph)', 'error');
      auth.signOut();
    }
  } else {
    // User is signed out
    loginBtn.classList.remove('hidden');
    userPanel.classList.add('hidden');
    userEmail.textContent = '';
    currentUser = null;
  }
});

// Show the login modal
function showLoginModal(message = null) {
  if (message) {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
  } else {
    loginError.classList.add('hidden');
  }
  
  loginModal.classList.remove('hidden');
  loginModal.classList.add('visible');
  
  // Close modal when clicking outside of it
  window.addEventListener('click', closeModalOnOutsideClick);
}

// Hide the login modal
function hideModal() {
  loginModal.classList.remove('visible');
  setTimeout(() => {
    loginModal.classList.add('hidden');
  }, 300); // Match transition duration
  
  window.removeEventListener('click', closeModalOnOutsideClick);
}

// Close modal when clicking outside
function closeModalOnOutsideClick(event) {
  if (event.target === loginModal) {
    hideModal();
  }
}

// Sign in with Google
function signInWithGoogle() {
  loginError.classList.add('hidden');
  
  auth.signInWithPopup(googleProvider)
    .catch(error => {
      console.error('Authentication error:', error);
      
      // Show error in modal
      let errorMessage = 'Authentication failed. Please try again.';
      if (error.code === 'auth/popup-blocked') {
        errorMessage = 'Popup was blocked. Please allow popups for this site.';
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMessage = 'Authentication was cancelled.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      loginError.textContent = errorMessage;
      loginError.classList.remove('hidden');
    });
}

// Show status message with improved message types
function showMessage(message, type = 'info') {
  const statusMessage = document.getElementById('status-message');
  if (statusMessage) {
    statusMessage.textContent = message;
    statusMessage.className = '';
    
    // Apply the appropriate class based on the message type
    if (message.toLowerCase().includes('signed in') || 
        message.toLowerCase().includes('login')) {
      statusMessage.classList.add('login-success');
    } else {
      statusMessage.classList.add(type);
    }
    
    // Auto-clear info and success messages after 5 seconds
    if (type !== 'error') {
      setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = '';
      }, 5000);
    }
  }
}

// Check if user is authenticated
function isAuthenticated() {
  return currentUser !== null;
}

// Require authentication
function requireAuth() {
  if (!isAuthenticated()) {
    showLoginModal('Please sign in to submit attendance records');
    return false;
  }
  return true;
}

// Event Listeners
loginBtn.addEventListener('click', () => showLoginModal());
googleSignInBtn.addEventListener('click', signInWithGoogle);
logoutBtn.addEventListener('click', () => auth.signOut());
closeModalBtn.addEventListener('click', hideModal);

// Initialize the login UI
document.addEventListener('DOMContentLoaded', () => {
  // Close button hover effect
  closeModalBtn.addEventListener('mouseenter', () => {
    closeModalBtn.style.transform = 'rotate(90deg)';
    closeModalBtn.style.transition = 'transform 0.3s ease';
  });
  
  closeModalBtn.addEventListener('mouseleave', () => {
    closeModalBtn.style.transform = 'rotate(0)';
  });
});