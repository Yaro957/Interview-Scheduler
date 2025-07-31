const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { connectDB, User } = require('./db');
const { sendNotificationMail } = require('./mailer'); // no path change needed


const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
connectDB();

// Helper function to generate time slots
const generateTimeSlots = (startTime, endTime) => {
  const slots = [];
  const currentTime = new Date(startTime);
  const endDateTime = new Date(endTime);
  
  while (currentTime < endDateTime) {
    slots.push(new Date(currentTime));
    currentTime.setMinutes(currentTime.getMinutes() + 15);
  }
  
  return slots;
};

// Helper function to check if a slot is occupied
const isSlotOccupied = async (slotTime) => {
  const startOfSlot = new Date(slotTime);
  const endOfSlot = new Date(slotTime.getTime() + 15 * 60 * 1000); // 15 minutes later
  
  const existingBooking = await User.findOne({
    preferredTime: {
      $gte: startOfSlot,
      $lt: endOfSlot
    }
  });
  
  return !!existingBooking;
};

app.use(express.json()); // to parse JSON POST bodies
app.set('view engine', 'ejs');
const path = require('path'); // Add this if not already present

app.set('views', path.join(__dirname, 'main'));

app.get('/', (req, res) => {
  res.render('main');
});


// GET /api/slots - Get all available slots
app.get('/api/slots', async (req, res) => {
  try {
    const startTime = new Date(process.env.START_TIME || '2024-01-01T09:00:00Z');
    const endTime = new Date(process.env.END_TIME || '2024-01-01T17:00:00Z');
    
    // Generate all possible slots
    const allSlots = generateTimeSlots(startTime, endTime);
    
    // Check which slots are available
    const availableSlots = [];
    
    for (const slot of allSlots) {
      const isOccupied = await isSlotOccupied(slot);
      if (!isOccupied) {
        availableSlots.push({
          time: slot.toISOString(),
          formattedTime: slot.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          })
        });
      }
    }
    
    res.json({
      success: true,
      data: availableSlots,
      total: availableSlots.length
    });
    
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available slots',
      error: error.message
    });
  }
});

// POST /api/book - Book a slot
app.post('/api/book', async (req, res) => {
  try {
    const {
      name,
      email,
      phoneNo,
      year,
      branch,
      preferredTime,
      resumeUrl
    } = req.body;
    
    // Validate required fields
    if (!name || !email || !phoneNo || !year || !branch || !preferredTime || !resumeUrl) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Validate year
    const validYears = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
    if (!validYears.includes(year)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid year. Must be one of: 1st Year, 2nd Year, 3rd Year, 4th Year'
      });
    }
    
    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Check if the selected time slot is available
    const slotTime = new Date(preferredTime);
    
    // Validate that the slot is within the configured time range
    const startTime = new Date(process.env.START_TIME || '2024-01-01T09:00:00Z');
    const endTime = new Date(process.env.END_TIME || '2024-01-01T17:00:00Z');
    
    if (slotTime < startTime || slotTime >= endTime) {
      return res.status(400).json({
        success: false,
        message: 'Selected time slot is outside the configured interview schedule',
        details: {
          requestedTime: slotTime.toISOString(),
          scheduleStart: startTime.toISOString(),
          scheduleEnd: endTime.toISOString()
        }
      });
    }
    
    // Validate that the slot aligns with 15-minute intervals
    const slotMinutes = slotTime.getMinutes();
    if (slotMinutes % 15 !== 0) {
      return res.status(400).json({
        success: false,
        message: 'Selected time slot must align with 15-minute intervals',
        details: {
          requestedTime: slotTime.toISOString(),
          validIntervals: 'Slots must start at :00, :15, :30, or :45 minutes'
        }
      });
    }
    
    const isOccupied = await isSlotOccupied(slotTime);
    
    if (isOccupied) {
      return res.status(400).json({
        success: false,
        message: 'Selected time slot is already booked'
      });
    }
    
    // Create new user booking
    const newUser = new User({
      name,
      email,
      phoneNo,
      year,
      branch,
      preferredTime: slotTime,
      resumeUrl
    });
    
    await newUser.save();
    sendNotificationMail("new entry",newUser)
    res.status(201).json({
      success: true,
      message: 'Interview slot booked successfully',
      data: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        preferredTime: newUser.preferredTime,
        formattedTime: newUser.preferredTime.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        })
      }
    });
    
  } catch (error) {
    console.error('Error booking slot:', error);
    res.status(500).json({
      success: false,
      message: 'Error booking interview slot',
      error: error.message
    });
  }

});

// GET /api/bookings - Get all bookings (for admin purposes)
app.get('/api/bookings', async (req, res) => {
  try {
    const bookings = await User.find().sort({ preferredTime: 1 });
    
    res.json({
      success: true,
      data: bookings.map(booking => ({
        id: booking._id,
        name: booking.name,
        email: booking.email,
        phoneNo: booking.phoneNo,
        year: booking.year,
        branch: booking.branch,
        preferredTime: booking.preferredTime,
        resumeUrl: booking.resumeUrl,
        formattedTime: booking.preferredTime.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        })
      }))
    });
    
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bookings',
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment variables:`);
  console.log(`- START_TIME: ${process.env.START_TIME || 'Not set (using default)'}`);
  console.log(`- END_TIME: ${process.env.END_TIME || 'Not set (using default)'}`);
  console.log(`- MONGODB_URI: ${process.env.MONGODB_URI ? 'Set' : 'Not set (using localhost)'}`);
});
