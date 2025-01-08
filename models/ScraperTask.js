// backend/models/ScraperTask.js

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

// 호텔 ID와 태스크 이름의 조합을 유니크하게 설정
ScraperTaskSchema.index({ hotelId: 1, taskName: 1 }, { unique: true });

const ScraperTask = mongoose.model('ScraperTask', ScraperTaskSchema);

export default ScraperTask;
