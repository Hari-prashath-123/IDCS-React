const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, Role } = require('../models');
const { JWT_SECRET } = require('../config/auth.config');

const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ where: { username }, include: Role });
    if (!user) {
      return res.status(404).send({ message: 'User not found' });
    }
    const passwordIsValid = await bcrypt.compare(password, user.password);
    if (!passwordIsValid) {
      return res.status(401).send({ message: 'Invalid password' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.Role ? user.Role.name : null },
      JWT_SECRET,
      { expiresIn: 86400 }
    );
    res.status(200).send({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.Role ? user.Role.name : null,
      accessToken: token,
    });
  } catch (err) {
    res.status(500).send({ message: 'Server error', error: err.message });
  }
};

module.exports = { login };
