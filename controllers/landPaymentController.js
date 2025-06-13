const landPaymentService = require('../services/landPaymentService');

 exports.createLandPayment = async (req, res) => {
    try {
        const payment = await landPaymentService.createLandPaymentService(req.body);
        res.status(201).json({
            message: 'Land payment created successfully',
            data: payment,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getAllLandPayments = async (req, res) => {
    try {
        const payments = await landPaymentService.getAllLandPaymentsService();
        res.status(200).json(payments);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getLandPaymentById = async (req, res) => {
    try {
        const payment = await landPaymentService.getLandPaymentByIdService(req.params.id);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        res.status(200).json(payment);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.updateLandPayment = async (req, res) => {
    try {
        const payment = await landPaymentService.updateLandPaymentService(req.params.id, req.body);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        res.status(200).json({ message: 'Payment updated successfully', data: payment });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.deleteLandPayment = async (req, res) => {
    try {
        const payment = await landPaymentService.deleteLandPaymentService(req.params.id);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        res.status(200).json({ message: 'Payment deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
