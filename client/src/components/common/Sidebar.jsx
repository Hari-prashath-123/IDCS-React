import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';

const Sidebar = () => {
  const { user } = useContext(AuthContext);

  if (!user) return null;

  return (
    <aside className="sidebar">
      <nav>
        <ul>
          {user.role === 'student' && (
            <>
              <li><Link to="/bonafide/apply">Apply for Bonafide</Link></li>
              <li><Link to="/attendance">My Attendance</Link></li>
            </>
          )}
          {user.role === 'hod' && (
            <>
              <li><Link to="/approvals">Approve Requests</Link></li>
              <li><Link to="/staff">View Staff</Link></li>
            </>
          )}
          {user.role === 'staff' && (
            <li><Link to="/mentees">Mentee List</Link></li>
          )}
          {/* Add more role-based links as needed */}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
