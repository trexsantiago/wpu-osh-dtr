// Wait for DOM to be loaded
document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const scannerPreview = document.getElementById("scanner-preview");
  const scannerTarget = document.getElementById("scanner-target");
  const employeeInfo = document.getElementById("employee-info");
  const employeeEmail = document.getElementById("employee-email");
  const employeeLastname = document.getElementById("employee-lastname");
  const employeeFirstname = document.getElementById("employee-firstname");
  const submitBtn = document.getElementById("submit-btn");
  const scanAgainBtn = document.getElementById("scan-again-btn");
  const statusMessage = document.getElementById("status-message");
  const networkStatus = document.getElementById("network-status");
  const pendingSyncs = document.getElementById("pending-syncs");
  const pendingCount = document.getElementById("pending-count");

  // IMPORTANT: Start with offline by default
  networkStatus.textContent = "Offline";
  networkStatus.classList.add("offline");
  
  // Create a more reliable network status monitor
  class NetworkMonitor {
    constructor(statusElement) {
      this.statusElement = statusElement;
      this.checkingInterval = null;
      this.isChecking = false;
      
      // Add browser event listeners for online/offline events
      window.addEventListener('online', () => this.handleConnectionChange(true));
      window.addEventListener('offline', () => this.handleConnectionChange(false));
      
      // Start monitoring
      this.startMonitoring();
    }
    
    // Handle browser-triggered connection changes
    handleConnectionChange(isOnline) {
      console.log("Browser reported network change:", isOnline ? "Online" : "Offline");
      
      if (isOnline) {
        this.setOnline();
        // Force an active check to confirm
        this.checkConnection();
      } else {
        this.setOffline();
      }
    }
    
    // Set UI to online state
    setOnline() {
      this.statusElement.textContent = "Online";
      this.statusElement.classList.remove("offline");
      
      // Dispatch a custom event that other parts of the app can listen for
      document.dispatchEvent(new CustomEvent('app-online'));
    }
    
    // Set UI to offline state
    setOffline() {
      this.statusElement.textContent = "Offline";
      this.statusElement.classList.add("offline");
      
      // Dispatch a custom event that other parts of the app can listen for
      document.dispatchEvent(new CustomEvent('app-offline'));
    }
    
    // Actively check connection status
    async checkConnection() {
      // Prevent multiple simultaneous checks
      if (this.isChecking) return;
      
      this.isChecking = true;
      
      try {
        const isOnline = await this.isOnline();
        
        if (isOnline) {
          this.setOnline();
        } else {
          this.setOffline();
        }
      } catch (error) {
        console.error("Error checking connection:", error);
        this.setOffline(); // Assume offline on error
      } finally {
        this.isChecking = false;
      }
    }
    
    // Check if we're online
    isOnline() {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log("Connection check timed out");
          resolve(false);
        }, 2000);
        
        fetch('https://www.google.com/generate_204', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store'
        })
        .then(() => {
          clearTimeout(timeout);
          resolve(true);
        })
        .catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });
      });
    }
    
    // Start monitoring the connection
    startMonitoring() {
      // Initial check
      this.checkConnection();
      
      // Clear any existing interval
      if (this.checkingInterval) {
        clearInterval(this.checkingInterval);
      }
      
      // Check periodically
      this.checkingInterval = setInterval(() => {
        this.checkConnection();
      }, 10000);
      
      // Add some extra checks shortly after startup
      setTimeout(() => this.checkConnection(), 2000);
      setTimeout(() => this.checkConnection(), 5000);
    }
    
    // Stop monitoring
    stopMonitoring() {
      if (this.checkingInterval) {
        clearInterval(this.checkingInterval);
        this.checkingInterval = null;
      }
    }
  }
  
  // Create network monitor
  const monitor = new NetworkMonitor(networkStatus);
  
  // Listen for network status changes
  document.addEventListener('app-online', async () => {
    console.log("App is online, checking for pending records...");
    
    // Always update the pending count first to show accurate UI
    await updatePendingSyncCount();
    
    // Get fresh count of pending records
    const pendingCount = await DB.getPendingCount();
    
    if (pendingCount > 0) {
      console.log(`Found ${pendingCount} pending records to sync`);
      
      // Don't show a status message - let the badge handle notifications
      // pendingSyncs element will be shown by updatePendingSyncCount/displayPendingRecords
      
      // If we're not logged in, prompt for login but don't attempt to sync yet
      if (!firebase.auth().currentUser) {
        console.log("Not authenticated, showing login modal");
        showLoginModal('Please sign in to sync pending records');
        
        // Add a one-time listener for auth state change to sync after login
        const unsubscribe = firebase.auth().onAuthStateChanged(user => {
          if (user) {
            console.log("User authenticated, will attempt sync");
            // User has logged in, try to sync
            syncPendingRecords().then(() => {
              console.log("Sync completed after authentication");
            }).catch(error => {
              console.error("Error syncing after auth:", error);
            });
            unsubscribe(); // Remove this listener
          }
        });
      } else {
        // Already logged in, sync immediately
        try {
          // Show syncing message now
          showStatus(`Syncing ${pendingCount} record/s...`, "info");
          
          console.log("Already authenticated, attempting sync immediately");
          const result = await syncPendingRecords();
          console.log("Sync complete:", result);
        } catch (error) {
          console.error("Error syncing records:", error);
          showStatus("Error syncing records: " + error.message, "error");
        }
      }
    }
    
    // Also try to initialize the scanner if it hasn't been done yet
    initializeScanner();
  });

  // Initialize IndexedDB immediately at the start
  await DB.init();
  
  // Check for pending records on initial page load and show count
  await displayPendingRecords();
  
  // Track scanner initialization state
  let scannerInitialized = false;
  let scanner = null;
  
  // Initialize scanner function - can be called when online
  async function initializeScanner() {
    if (scannerInitialized) return;
    
    try {
      // Initialize QR scanner
      scanner = new QRScanner(scannerPreview, scannerTarget);
      
      // Start scanner
      const scannerStarted = await scanner.start();
      if (scannerStarted) {
        scannerInitialized = true;
        console.log("Scanner initialized successfully");
      } else {
        console.log("Scanner initialization failed, will retry when online");
        showStatus(
          "Camera access pending. Check permissions if this persists.",
          "warning",
          8000
        );
      }
    } catch (error) {
      console.error("Scanner error:", error);
      // Don't show error message for offline scanner initialization
      if (await monitor.isOnline()) {
        showStatus(
          "Camera unavailable. Check permissions and try again.",
          "warning",
          8000
        );
      }
    }
  }
  
  // Try to initialize scanner (will work if online)
  initializeScanner();

  // QR scan event listener
  document.addEventListener("qr-scanned", (event) => {
    const employeeData = event.detail;

    // Display employee info
    employeeLastname.textContent = employeeData.lastName;
    employeeFirstname.textContent = employeeData.firstName;

    // Show employee info section
    employeeInfo.classList.remove("hidden");
  });

  // QR scan error event listener
  document.addEventListener("qr-error", (event) => {
    showStatus(event.detail, "error");
  });

  // Modify the submit button click handler section:
  submitBtn.addEventListener("click", async () => {
    try {
      // Check if we're online
      const isOnline = await monitor.isOnline();
      
      if (isOnline) {
        // We're online - require authentication
        if (!requireAuth()) {
          return; // Stop if not authenticated
        }
      }
      
      // Get form data
      const timestamp = new Date().toISOString();
      const lastName = employeeLastname.textContent;
      const firstName = employeeFirstname.textContent;
      
      // Verify we have the required fields
      if (!lastName || !firstName) {
        showStatus("Missing employee data. Please scan again.", "error");
        return;
      }
      
      const actionElement = document.querySelector('input[name="action"]:checked');
      if (!actionElement) {
        showStatus("Please select an action.", "error");
        return;
      }
      const action = actionElement.value;
      
      // Create record without email - will be added during sync
      const record = {
        timestamp,
        lastName,
        firstName,
        action
      };

      // Save to IndexedDB
      console.log("Saving record to IndexedDB:", record);
      const savedRecord = await DB.saveRecord(record);
      console.log("Record saved successfully:", savedRecord);
      
      if (isOnline && firebase.auth().currentUser) {
        // We're online and authenticated, sync immediately
        showStatus("Syncing record...", "info");
        try {
          await syncRecord(savedRecord);
          showStatus("Attendance recorded successfully!", "success");
        } catch (syncError) {
          console.error("Error syncing record:", syncError);
          showStatus("Record saved locally but sync failed. Will retry later.", "warning");
          // Make sure the record is marked as pending
          await DB.updateSyncStatus(savedRecord.id, "pending");
        }
      } else {
        // Offline or not authenticated, will sync later
        showStatus("Record saved locally. Will sync when online.", "info");
      }
      
      // Update pending count display
      await updatePendingSyncCount();
      
      // Reset form
      employeeInfo.classList.add("hidden");
      
      // Force refresh to ensure transitions complete
      void employeeInfo.offsetWidth;
      
      // Give the UI time to update before restarting scanner
      setTimeout(() => {
        if (scannerInitialized && scanner) {
          console.log("Resuming scanner after submission");
          scanner.resume();
        }
      }, 300);
      
    } catch (error) {
      console.error("Error in submit handler:", error);
      showStatus("Error saving attendance record: " + error.message, "error");
    }
  });

  // Scan again button click event
  scanAgainBtn.addEventListener("click", () => {
    employeeInfo.classList.add("hidden");
    
    // Resume scanner if initialized
    if (scannerInitialized && scanner) {
      scanner.resume();
    } else {
      showStatus("Camera not available yet. Connect to internet first.", "warning");
    }
  });

  // Improved function to sync pending records
  async function syncPendingRecords() {
    try {
      // Get fresh list of pending records
      const pendingRecords = await DB.getPendingRecords();
      console.log(`Preparing to sync ${pendingRecords.length} pending records`);

      if (pendingRecords.length === 0) {
        return { success: true, synced: 0 };
      }

      // Require authentication for syncing
      if (!firebase.auth().currentUser) {
        showLoginModal('Please sign in to sync pending records');
        return { success: false, reason: 'not-authenticated' };
      }
      
      showStatus(`Syncing record/s...`, "info");

      let syncedCount = 0;
      let failedCount = 0;
      const results = [];

      for (const record of pendingRecords) {
        if (await monitor.isOnline()) {
          try {
            // Update status to syncing
            await DB.updateSyncStatus(record.id, "syncing");
            
            // Submit to Google Sheets
            await SheetsAPI.submitAttendance(record);
            
            // Update to synced
            await DB.updateSyncStatus(record.id, "synced");
            
            syncedCount++;
            results.push({ id: record.id, success: true });
          } catch (error) {
            console.error("Error syncing record:", error);
            // Mark as pending again to retry later
            await DB.updateSyncStatus(record.id, "pending");
            failedCount++;
            results.push({ id: record.id, success: false, error: error.message });
          }
        } else {
          // We went offline during sync
          console.log("Connection lost during sync, stopping");
          break;
        }
      }

      // Show completion message based on results
      if (syncedCount > 0 && failedCount === 0) {
        showStatus(`Successfully synced ${syncedCount} record/s.`, "success");
      } else if (syncedCount > 0 && failedCount > 0) {
        showStatus(`Synced ${syncedCount} record/s. ${failedCount} failed.`, "warning");
      } else if (syncedCount === 0 && failedCount > 0) {
        showStatus(`Failed to sync ${failedCount} record/s.`, "error");
      }

      // Update the pending count display
      await updatePendingSyncCount();
      
      return {
        success: syncedCount > 0,
        synced: syncedCount,
        failed: failedCount,
        results: results
      };
    } catch (error) {
      console.error("Error in syncPendingRecords:", error);
      showStatus("Error syncing records. Please try again.", "error");
      return { success: false, error: error.message };
    }
  }

  // Function to sync a single record
  async function syncRecord(record) {
    if (!firebase.auth().currentUser) {
      throw new Error("Authentication required to sync record");
    }
    
    try {
      console.log("Syncing record:", record);
      await SheetsAPI.submitAttendance(record);
      await DB.updateSyncStatus(record.id, "synced");
      console.log("Record synced successfully");
      return true;
    } catch (error) {
      console.error("Error syncing record:", error);
      throw error;
    }
  }

  // Function to display pending records count
  async function displayPendingRecords() {
    try {
      const count = await DB.getPendingCount();
      console.log(`Found ${count} pending records`);
      
      // Update the counter
      pendingCount.textContent = count;
      
      // Show or hide the pending syncs indicator
      if (count > 0) {
        // Show the orange notification badge
        pendingSyncs.classList.remove("hidden");
        
        // Don't show a status message - let the badge handle it
        // We'll only clear any "waiting to be synced" messages if they exist
        if (statusMessage.textContent.includes("waiting to be synced") || 
            statusMessage.textContent.includes("record/s")) {
          statusMessage.textContent = "";
          statusMessage.className = "";
        }
      } else {
        pendingSyncs.classList.add("hidden");
      }
      
      return count;
    } catch (error) {
      console.error("Error checking pending records:", error);
      return 0;
    }
  }
  
  // Replace your existing updatePendingSyncCount function with this
  async function updatePendingSyncCount() {
    return displayPendingRecords();
  }
  
  // Add this check periodically (every 15 seconds)
  setInterval(() => {
    if (!document.hidden) {
      displayPendingRecords();
    }
  }, 15000);
  
  // Also check when the page becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(() => displayPendingRecords(), 500);
    }
  });
  
  // Function to show status messages
  function showStatus(message, type = "info", duration = 5000) {
    statusMessage.textContent = message;
    statusMessage.className = "";
    statusMessage.classList.add(type);

    // Only set timeout if duration > 0
    if (duration > 0) {
      setTimeout(() => {
        // Only clear if this specific message is still showing
        if (statusMessage.textContent === message) {
          statusMessage.textContent = "";
          statusMessage.className = "";
        }
      }, duration);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // Page is now visible again
      console.log("Page visible, checking app state");
      
      // Check if we're showing employee info (after a scan)
      if (!employeeInfo.classList.contains('hidden')) {
        console.log("Employee info is visible - making no changes");
        return; // Keep showing employee info
      }
      
      // If we're not showing employee info, we should be scanning
      if (scannerInitialized && scanner) {
        // Wait a moment to ensure camera resources are available
        setTimeout(() => {
          if (!scanner.isScanning) {
            console.log("Restarting scanner from app.js");
            scanner.resume();
          }
        }, 800);
      }
    }
  });
});
