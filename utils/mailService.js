const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

exports.sendPasswordResetEmail = async (email, name, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: `"City Developmen system" <${process.env.EMAIL_FROM || process.env.EMAIL_USERNAME}>`,
    to: email,
    subject: "የፓሥዎርድ መቀየሪያ ሊንክ",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Hello ${name},</h2>
        <p>የፓስዎርድ መቀየሪያ ጠይቀዋል. ከታች ያለዉን አረንጓዴ ማስፈንጠሊያ በመንካት ፓሥዎርድ ይቀይሩ:</p>
        <a href="${resetUrl}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          ፓስዎርድ መቀየሪያ ሊንክ
        </a>
        <p><small>ይህ ማስፈንጠሪያ በ 1 ሰዓት ዉስጥ ይቋረጣል.</small></p>
        <p>ጥያቄ ካላቀረቡ ይህን ኢሜል ችላ ይበሉ</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};