import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './routes/Dashboard'
import { Library } from './routes/Library'
import { Song } from './routes/Song'
import { Practice } from './routes/Practice'
import { Creation } from './routes/Creation'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:songId" element={<Song />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/creation" element={<Creation />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
