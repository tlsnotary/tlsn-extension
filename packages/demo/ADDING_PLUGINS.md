# Adding New Plugins

Adding new plugins to the demo is straightforward. Just update the `plugins.ts` file:

## Example: Adding a GitHub Plugin

```typescript
// packages/demo/src/plugins.ts

export const plugins: Record<string, Plugin> = {
  // ... existing plugins ...
  
  github: {
    name: 'GitHub Profile',
    description: 'Prove your GitHub contributions and profile information',
    logo: '🐙',  // or use emoji: '💻', '⚡', etc.
    file: '/github.js',
    parseResult: (json) => {
      return json.results[json.results.length - 1].value;
    },
  },
};
```

## Plugin Properties

| Property      | Type     | Description                                             |
| ------------- | -------- | ------------------------------------------------------- |
| `name`        | string   | Display name shown in the card header                   |
| `description` | string   | Brief description of what the plugin proves             |
| `logo`        | string   | Emoji or character to display as the plugin icon        |
| `file`        | string   | Path to the plugin JavaScript file                      |
| `parseResult` | function | Function to extract the result from the plugin response |

## Tips

- **Logo**: Use emojis for visual appeal (🔒, 🎮, 📧, 💰, etc.)
- **Description**: Keep it concise (1-2 lines) explaining what data is proven
- **File**: Place the plugin JS file in `/packages/demo/` directory
- **Name**: Use short, recognizable names

## Card Display

The plugin will automatically render as a card with:
- Large logo at the top
- Plugin name as heading
- Description text below
- "Run Plugin" button at the bottom
- Hover effects and animations
- Running state with spinner

No additional UI code needed!
