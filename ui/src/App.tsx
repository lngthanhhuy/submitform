import { Route, Routes } from 'react-router-dom';
import CareerForm from './pages/CareerForm';

function App() {
  return (
    <Routes>
      <Route
        path='/careerform'
        element={<CareerForm />}
      />
    </Routes>
  );
}

export default App
