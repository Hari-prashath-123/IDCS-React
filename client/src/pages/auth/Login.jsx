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
    <div className="sufee-login d-flex align-content-center flex-wrap" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>
      <div className="container">
        <div className="login-content">
          <div className="login-logo">
            <a href="/">
              <img className="align-content" src="/src/assets/images/logo2.png" alt="Logo" />
            </a>
          </div>
          {error && (
            <div className="alert alert-danger" role="alert">{error}</div>
          )}
          <div className="login-form">
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="username">Register Number</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  className="form-control"
                  placeholder="Register Number"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  className="form-control"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="checkbox d-flex justify-content-between align-items-center mb-3">
                <label>
                  <input type="checkbox" /> Remember Me
                </label>
                <label className="pull-right mb-0">
                  <a href="/auth/forgot-password">Forgot Password?</a>
                </label>
              </div>
              <button type="submit" className="btn btn-success btn-flat m-b-30 m-t-30">Sign in</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;