import mongoose from 'mongoose';

const ScraperTaskSchema = new mongoose.Schema(
  {
    hotelId: { type: String, required: true },
    taskName: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'failed'],
      default: 'pending',
    },
    lastRunAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true }
);

ScraperTaskSchema.index({ hotelId: 1, taskName: 1 }, { unique: true });

const ScraperTask = mongoose.model('ScraperTask', ScraperTaskSchema);

export default ScraperTask;