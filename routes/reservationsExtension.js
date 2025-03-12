import express from 'express';
import {
  createOrUpdateReservationsExtension,
} from '../controllers/reservationsExtensionController.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.post('/', asyncHandler(createOrUpdateReservationsExtension));

export default router;