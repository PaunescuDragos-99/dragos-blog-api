const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  username: {
    type: String,
    required: true,
    minLength: 3,
    maxLength: 50,
    unique: true,
  },
  password: { type: String, required: true, minLength: 3 },
});

module.exports = mongoose.model("User", UserSchema);
