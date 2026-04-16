const mongoose = require('mongoose');

const idCardSubmissionSchema = new mongoose.Schema(
  {
    principalId:  { type: String, required: true },                    // principal who created the form
    userId:       { type: String, required: true },                    // student/teacher who filled it
    userEmail:    { type: String, required: true },                    // user email for reference
    userName:     { type: String, default: '' },                       // user name for reference
    role:         { type: String, enum: ['student', 'teacher'], required: true }, // who is filling
    answers:      { type: Map, of: String, required: true },           // form submission answers {"Full Name": "Aryan", ...}
    submittedAt:  { type: Date, default: Date.now },                   // when submitted
  },
  { timestamps: true }
);

// Index for quick lookups
idCardSubmissionSchema.index({ principalId: 1 });
idCardSubmissionSchema.index({ userId: 1 });
idCardSubmissionSchema.index({ principalId: 1, userId: 1, role: 1 });

module.exports = mongoose.model('IdCardSubmission', idCardSubmissionSchema);
