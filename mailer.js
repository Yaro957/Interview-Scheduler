// mailer.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail", // or use host/port for custom SMTP
  auth: {
    user: process.env.EMAIL_USER, // your Gmail
    pass: process.env.EMAIL_PASS, // your app password (not Gmail password)
  },
});

const sendNotificationMail = async (subject, obj) => {
  const usertext=`${obj.name} just filled out the form for club head of hackslash`
  const mailOptions = {
    from: `"Notifier Bot" <${process.env.EMAIL_USER}>`,
    to: process.env.NOTIFY_EMAIL, // your personal email
    subject: subject,
    text: usertext,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Notification email sent.");
  } catch (error) {
    console.error("Failed to send email:", error);
  }
};

module.exports = { sendNotificationMail };
