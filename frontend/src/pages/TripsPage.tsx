import React from 'react';
import { Container, Typography, Button, Box } from '@mui/material';
import { useAuth } from '../context/AuthContext';

const TripsPage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <Container sx={{ mt: 8 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4">Мои поездки</Typography>
        <Box>
          <Typography variant="body1" component="span" sx={{ mr: 2 }}>
            {user ? `Привет, ${user.username}` : ''}
          </Typography>
          <Button variant="outlined" onClick={logout}>
            Выйти
          </Button>
        </Box>
      </Box>

      <Typography>Тут позже будет список поездок.</Typography>
    </Container>
  );
};

export default TripsPage;