const {LandPayment} = require('../models');

 exports.createLandPaymentService = async (paymentData) => {
    return await LandPayment.create(paymentData);
};

 exports.getAllLandPaymentsService = async () => {
    return await LandPayment.findAll();
};

 exports.getLandPaymentByIdService = async (id) => {
    return await LandPayment.findByPk(id);
};

 exports.updateLandPaymentService = async (id, paymentData) => {
    const payment = await LandPayment.findByPk(id);
    if (!payment) return null;
    return await payment.update(paymentData);
};

exports.deleteLandPaymentService = async (id) => {
    const payment = await LandPayment.findByPk(id);
    if (!payment) return null;
    return await payment.destroy();
};


