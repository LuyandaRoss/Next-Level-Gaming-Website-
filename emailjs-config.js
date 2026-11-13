// Next Level Gaming - EmailJS Configuration
const EMAILJS_CONFIG = {
    // 1. Account Public Key
    publicKey: "MFMI3nHqPAupfDDTC",

    // 2. Email Service ID
    serviceId: "service_00ophre",

    // 3. Email Template ID for Booking Quotations
    templateId: "template_b9cbcqi",

    // 4. Optional: Admin Alert Template ID
    adminTemplateId: "",

    // 5. Optional: Contact Form Template ID
    contactTemplateId: ""
};

// Initialize EmailJS with public key
if (typeof emailjs !== 'undefined' && EMAILJS_CONFIG.publicKey) {
    emailjs.init({
        publicKey: EMAILJS_CONFIG.publicKey
    });
}
