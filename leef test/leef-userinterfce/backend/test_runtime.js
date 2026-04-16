require("dotenv").config();
const nodemailer = require("nodemailer");
const fs = require("fs");

async function check() {
    let result = { envLoaded: false, connectionOk: false, emailSent: false, error: null };
    try {
        result.envLoaded = !!(process.env.MAIL_USER && process.env.MAIL_APP_PASSWORD);
        if (!result.envLoaded) {
            result.error = "Missing environment variables.";
            fs.writeFileSync("test_result.json", JSON.stringify(result));
            return;
        }

        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_APP_PASSWORD,
            },
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 5000,
        });

        await transporter.verify();
        result.connectionOk = true;

        const info = await transporter.sendMail({
            from: `"Leef Diagnostic" <${process.env.MAIL_USER}>`,
            to: process.env.MAIL_USER,
            subject: "Diagnostic",
            text: "Testing"
        });

        result.emailSent = true;
        result.messageId = info.messageId;

    } catch (e) {
        result.error = {
            message: e.message,
            code: e.code,
            command: e.command,
            response: e.response
        };
    }
    fs.writeFileSync("test_result.json", JSON.stringify(result, null, 2));
}

check();
