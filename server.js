const express = require('express');
const path = require('path');
const sheetsService = require('./services/sheetsService');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get the back door password
app.get('/api/password', async (req, res) => {
  try {
    const password = await sheetsService.getPassword();
    res.json({ password });
  } catch (error) {
    console.error('Error getting password:', error);
    res.status(500).json({ error: 'Failed to retrieve password' });
  }
});

// API endpoint to verify guest credentials
app.post('/api/verify', async (req, res) => {
  try {
    const {name, roomNumber } = req.body;
    
   if (!name || !roomNumber) {
      return res.status(400).json({ error: 'Reservation number and room number are required' });
    }

    const isValid = await sheetsService.verifyGuest(name, roomNumber);
    res.json({ isValid });
  } catch (error) {
    console.error('Error verifying guest:', error);
    res.status(500).json({ error: 'Failed to verify guest' });
  }
});

// API endpoint for extend stay request 
app.post('/api/extendStay', async (req, res) => {  
  try {     
    const { reservationNumber, roomNumber } = req.body;          
    if (!reservationNumber || !roomNumber) {       
      return res.status(400).json({ error: 'Reservation number and room number are required' });     
    }         
   const success = await sheetsService.saveExtendStayRequest(reservationNumber, roomNumber);   
   res.json({ success });   
  } catch (error) {     
    console.error('Error saving extend stay request:', error);     
    res.status(500).json({ error: 'Failed to save extend stay request' });   
  } 
});

// API endpoint for sending feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const { feedbackText } = req.body;
    
    if (!feedbackText) {
      return res.status(400).json({ error: 'Feedback text is required' });
    }
    
    const success = await sheetsService.sendFeedback(feedbackText);
    res.json({ success });
  } catch (error) {
    console.error('Error sending feedback:', error);
    res.status(500).json({ error: 'Failed to send feedback' });
  }
});


// Test connection endpoint
app.get('/api/test', async (req, res) => {
  try {
    const result = await sheetsService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the application`);
});