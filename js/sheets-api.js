const SheetsAPI = {
  // Update with your new deployment URL
  SHEET_URL:
    "https://script.google.com/macros/s/AKfycbx_FoIkmid5xjSQEWNOLvi9v5taZSCL4mUb6OU-zEo1NbqD5-zXoSs6NqOa2r6LwM4v5w/exec",

  async submitAttendance(record) {
    return new Promise((resolve, reject) => {
      try {
        // Verify we're logged in
        if (!firebase.auth().currentUser) {
          reject(new Error("Must be logged in to sync records"));
          return;
        }

        // Get the current user's email
        const userEmail = firebase.auth().currentUser.email;
        
        // Create a unique callback function name
        const callbackName =
          "jsonpCallback_" + Math.round(Math.random() * 1000000);

        // Define the callback function that will handle the response
        window[callbackName] = function (response) {
          // Clean up - remove the script tag and delete the global callback function
          document.body.removeChild(scriptElement);
          delete window[callbackName];

          if (response && response.success) {
            resolve(true);
          } else {
            reject(new Error(response?.message || "Unknown error"));
          }
        };

        // Build URL with parameters
        const url = new URL(this.SHEET_URL);
        url.searchParams.append("operation", "log");
        url.searchParams.append("callback", callbackName);
        url.searchParams.append("timestamp", record.timestamp);
        url.searchParams.append("email", userEmail); // Use current user's email
        url.searchParams.append("actionType", record.action);
        url.searchParams.append("lastName", record.lastName);
        url.searchParams.append("firstName", record.firstName);

        // Create a script element to make the JSONP request
        const scriptElement = document.createElement("script");
        scriptElement.src = url.toString();

        // Handle script load errors
        scriptElement.onerror = function () {
          document.body.removeChild(scriptElement);
          delete window[callbackName];
          reject(new Error("Failed to load the JSONP script"));
        };

        // Add the script element to the page to start the request
        document.body.appendChild(scriptElement);
      } catch (error) {
        console.error("Error submitting to Google Sheets:", error);
        reject(error);
      }
    });
  },
};
