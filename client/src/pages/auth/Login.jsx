import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
// 1. CHANGE THIS LINE:
import { authApi } from '../../services/auth.service';
import { AuthContext } from '../../contexts/AuthContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // The 'username' variable is passed as the 'email' parameter
      const userData = await authApi.login(username, password);
      login(userData);
      // --- NEW NAVIGATION LOGIC ---
      // Assuming userData contains the user's role
      const userRole = userData.role;
      switch (userRole) {
        case 'student':
          navigate('/student/dashboard');
          break;
        case 'staff':
          navigate('/staff/dashboard');
          break;
        case 'hod':
          navigate('/hod/dashboard');
          break;
        case 'ahod':
          navigate('/ahod/dashboard');
          break;
        case 'principal':
          navigate('/principal/dashboard');
          break;
        case 'pet_staff':
          navigate('/petstaff/dashboard');
          break;
        default:
          navigate('/profile');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };
  
  // ... rest of the file is fine
  return (
    <div className="login-container">
      <form onSubmit={handleSubmit}>
        <h2>Login</h2>
        {error && <div className="error">{error}</div>}
        <div>
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit">Login</button>
      </form>
    </div>
  );
};

export default Login;