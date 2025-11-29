const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

exports.sendEmail = async ({from, to, subject, html }) => {
  const mailOptions = {
    from,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
};