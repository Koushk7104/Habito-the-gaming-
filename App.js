import React, { useState, useEffect } from 'react';
import axios from 'axios';

const App = () => {
  const [posts, setPosts] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    // Fetch all blog posts when the component mounts
    axios.get('/api/posts').then((response) => {
      setPosts(response.data);
    });
  }, []);

  const handleCreatePost = () => {
    // Create a new blog post
    axios.post('/api/posts', { title, content }).then((response) => {
      setPosts([...posts, response.data]);
      setTitle('');
      setContent('');
    });
  };

  return (
    <div>
      <h1>React Blog Platform</h1>
      <div>
        <h2>Create a New Post</h2>
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          placeholder="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        ></textarea>
        <button onClick={handleCreatePost}>Create Post</button>
      </div>
      <div>
        <h2>All Posts</h2>
        <ul>
          {posts.map((post) => (
            <li key={post._id}>
              <h3>{post.title}</h3>
              <p>{post.content}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default App;
