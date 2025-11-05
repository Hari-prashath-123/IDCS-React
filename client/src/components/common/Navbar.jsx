import React, { useContext } from 'react';
import { AuthContext } from '../../contexts/AuthContext';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);

  return (
    <header className="navbar">
      <div className="navbar-user">
        {user ? `Welcome, ${user.username}` : ''}
      </div>
      <button onClick={logout} className="logout-btn">Logout</button>
    </header>
  );
};

export default Navbar;
