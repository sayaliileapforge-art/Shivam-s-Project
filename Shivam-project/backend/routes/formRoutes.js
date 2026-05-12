const express = require('express');
const router = express.Router();

const {
	getForm,
	submitForm,
	getSubmissions,
	getSubmissionById,
} = require('../controllers/formController');

// Debug wrapper to confirm the route is hit
router.get('/', (req, res, next) => {
	console.log('🔥 /api/form route hit — query:', req.query);
	next();
}, getForm);

// Submit form data
router.post('/submit', (req, res, next) => {
	console.log('🔥 /api/form/submit route hit');
	next();
}, submitForm);

// Get all submissions (for principal)
router.get('/submissions', (req, res, next) => {
	console.log('🔥 /api/form/submissions route hit — query:', req.query);
	next();
}, getSubmissions);

// Get single submission
router.get('/submissions/:submissionId', (req, res, next) => {
	console.log('🔥 /api/form/submissions/:submissionId route hit — id:', req.params.submissionId);
	next();
}, getSubmissionById);

module.exports = router;
