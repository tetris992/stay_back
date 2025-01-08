// // backend/controllers/memoController.js

// import getMemoModel from '../models/Memo.js';

// export const getMemo = async (req, res) => {
//   const { hotelId, reservationId, customerName } = req.params;
//   if (!hotelId || !reservationId || !customerName) {
//     return res.status(400).json({ message: 'hotelId, reservationId and customerName are required.' });
//   }

//   try {
//     const Memo = getMemoModel(hotelId);
//     const memoDoc = await Memo.findOne({ hotelId, reservationId, customerName });
//     const memoText = memoDoc ? memoDoc.memoText : '';
//     res.status(200).json({ memoText });
//   } catch (error) {
//     console.error('Failed to fetch memo:', error);
//     res.status(500).json({ message: 'Server error.' });
//   }
// };

// export const updateMemo = async (req, res) => {
//   const { hotelId, reservationId, customerName } = req.params;
//   const { memoText } = req.body;

//   if (!hotelId || !reservationId || !customerName) {
//     return res.status(400).json({ message: 'hotelId, reservationId and customerName are required.' });
//   }

//   try {
//     const Memo = getMemoModel(hotelId);
//     const updated = await Memo.findOneAndUpdate(
//       { hotelId, reservationId, customerName },
//       { memoText, updatedAt: new Date() },
//       { upsert: true, new: true }
//     );
//     res.status(200).json(updated);
//   } catch (error) {
//     console.error('Failed to update memo:', error);
//     res.status(500).json({ message: 'Server error.' });
//   }
// };
