const fs = require('fs');

// Base64 string (replace with your actual Base64 string)
const base64String = `
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
`;

// Convert Base64 to image and save it
const base64ToImage = (base64String, fileName) => {
    const buffer = Buffer.from(base64String, 'base64');
    fs.writeFileSync(fileName, buffer);
    console.log(`Image saved as ${fileName}`);
};

// Call the function
base64ToImage(base64String, 'output_image.png');
