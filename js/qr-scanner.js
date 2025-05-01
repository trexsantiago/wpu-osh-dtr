class QRScanner {
  constructor(videoElement, targetElement) {
    this.videoElement = videoElement;
    this.targetElement = targetElement;
    this.codeReader = new ZXing.BrowserMultiFormatReader();
    this.isScanning = false;
    this.capturedCanvas = document.getElementById('captured-image');
    this.capturedCtx = this.capturedCanvas ? this.capturedCanvas.getContext('2d') : null;
    this.wasScanning = false; // Add this to track scanner state
    
    // Update page visibility event listener
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Store current scanning state before stopping
        this.wasScanning = this.isScanning;
        if (this.isScanning) {
          console.log("Page hidden, stopping scanner");
          this.stop();
        }
      } else if (this.wasScanning) {
        // Page visible again and scanner was active before
        console.log("Page visible again, restarting scanner");
        setTimeout(() => this.start(), 500);
      }
    });
    
    window.addEventListener('beforeunload', () => {
      this.stop();
    });
  }

  async start() {
    try {
      // Hide the captured image if it was previously shown
      if (this.capturedCanvas) {
        this.capturedCanvas.style.display = 'none';
      }
      
      // Make sure camera is fully stopped before restarting
      this.forceStopCamera();
      
      this.isScanning = true;
      const videoInputDevices = await this.codeReader.listVideoInputDevices();

      // Use the first camera device
      const selectedDeviceId = videoInputDevices.length > 0 ? 
        videoInputDevices[0].deviceId : undefined;

      // Start decoding from video device
      const controls = await this.codeReader.decodeFromVideoDevice(
        selectedDeviceId,
        this.videoElement,
        this.onScan.bind(this),
      );

      this.controls = controls;
      return true;
    } catch (error) {
      console.error("Error starting QR scanner:", error);
      return false;
    }
  }

  stop() {
    try {
      if (this.controls) {
        this.controls.stop();
        this.controls = null;
      }
      
      this.forceStopCamera();
      this.isScanning = false;
    } catch (error) {
      console.error("Error stopping QR scanner:", error);
    }
  }
  
  // More aggressive camera shutdown
  forceStopCamera() {
    try {
      // Stop and remove all media tracks
      if (this.videoElement && this.videoElement.srcObject) {
        const tracks = this.videoElement.srcObject.getTracks();
        tracks.forEach(track => {
          try {
            track.stop();
            track.enabled = false;
          } catch (e) {
            console.log('Error stopping track:', e);
          }
        });
        
        // Clear video element
        this.videoElement.srcObject = null;
        this.videoElement.removeAttribute('srcObject');
        this.videoElement.pause();
        this.videoElement.src = '';
        this.videoElement.load(); // Force reload to clear resources
      }
      
      // In some browsers, this helps force camera release
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: false, video: false })
          .then(stream => {
            // Immediately stop this empty stream
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(() => {/* Ignore errors */});
      }
      
      // Force ZXing to reset
      if (this.codeReader) {
        try {
          // Reset the reader entirely
          this.codeReader = new ZXing.BrowserMultiFormatReader();
        } catch (e) {
          console.log('Error recreating ZXing reader:', e);
        }
      }
    } catch (error) {
      console.error('Error in forceStopCamera:', error);
    }
  }

  captureFrame() {
    if (!this.capturedCanvas || !this.capturedCtx) return;
    
    // Set canvas dimensions to match video
    this.capturedCanvas.width = this.videoElement.videoWidth;
    this.capturedCanvas.height = this.videoElement.videoHeight;
    
    // Draw the current video frame to the canvas
    this.capturedCtx.drawImage(
      this.videoElement, 
      0, 0, 
      this.videoElement.videoWidth, 
      this.videoElement.videoHeight
    );
    
    // Display the canvas
    this.capturedCanvas.style.display = 'block';
  }

  onScan(result) {
    if (result && this.isScanning) {
      // Stop scanning once a QR code is detected
      this.isScanning = false;

      try {
        // Get the URL text from the QR code
        const urlText = result.getText();
        
        // Check if it's a Google Forms URL
        if (urlText.includes('docs.google.com/forms')) {
          // Extract employee data from URL parameters
          const url = new URL(urlText);
          const params = new URLSearchParams(url.search);
          
          // Extract lastname and firstname from URL parameters
          const lastName = params.get('entry.1575753690') || '';
          const firstName = params.get('entry.1621774329') || '';
          
          // Decode the URL-encoded values and replace + with spaces
          const decodedLastName = decodeURIComponent(lastName.replace(/\+/g, ' '));
          const decodedFirstName = decodeURIComponent(firstName.replace(/\+/g, ' '));
          
          // Create employeeData object (without email)
          const employeeData = {
            lastName: decodedLastName,
            firstName: decodedFirstName
          };
          
          // Add success class to stop the animation
          const scannerTarget = document.getElementById('scanner-target');
          if (scannerTarget) {
            scannerTarget.classList.add('scan-success');
          }
          
          // Capture the current frame
          this.captureFrame();
          
          // Stop the camera
          this.stop();

          // Dispatch custom event with employee data
          const scanEvent = new CustomEvent("qr-scanned", {
            detail: employeeData,
          });
          document.dispatchEvent(scanEvent);
        } else {
          throw new Error("Not a valid Google Forms URL");
        }
      } catch (error) {
        console.error("Invalid QR code format:", error);

        // Dispatch error event
        const errorEvent = new CustomEvent("qr-error", {
          detail: "Invalid QR code format. Please try again.",
        });
        document.dispatchEvent(errorEvent);

        // Resume scanning
        this.isScanning = true;
      }
    }
  }

  resume() {
    // Hide the captured image
    if (this.capturedCanvas) {
      this.capturedCanvas.style.display = 'none';
    }
    
    // Remove success class to restart the pulse animation
    const scannerTarget = document.getElementById('scanner-target');
    if (scannerTarget) {
      scannerTarget.classList.remove('scan-success');
    }
    
    // Ensure camera is fully stopped before restarting
    this.stop();
    
    // Add a small delay to ensure resources are released
    setTimeout(() => {
      // Restart the camera
      this.start();
    }, 100);
  }
}
