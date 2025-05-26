import { UPLOADTHING_TOKEN } from '$env/static/private'; // Your UploadThing Secret Key
import { json } from '@sveltejs/kit';
import { UTApi } from 'uploadthing/server'; // Import the UTApi class

export async function POST({ request }) {
  try {
    const formData = await request.formData();
    const file = formData.get('files'); // Retrieves the file from the form data

    // Check if a file was actually provided and is a File object
    if (!file || typeof file === 'string') {
      return json({ error: 'No file provided or invalid file entry.' }, { status: 400 });
    }

    // Log the token to verify it's loaded correctly
    console.log('UPLOADTHING_TOKEN from $env/static/private:', UPLOADTHING_TOKEN);

    // Check if the token is missing or empty BEFORE initializing UTApi
    if (!UPLOADTHING_TOKEN) {
      console.error('UPLOADTHING_TOKEN is missing or empty. Please check your .env file and server restart.');
      return json({ error: 'Server configuration error: UploadThing token is missing.' }, { status: 500 });
    }

    // Instantiate UTApi with your API key (secret key)
    // UPLOADTHING_TOKEN should be your actual secret key (e.g., sk_live_...)
    const utapi = new UTApi({ token: UPLOADTHING_TOKEN });

    // Upload the file using utapi.
    // 'file' here is the File object obtained from formData.
    // UTApi's uploadFiles method can handle File objects directly.
    console.log(`Uploading file: ${file.name}, size: ${file.size}, type: ${file.type}`);
    const response = await utapi.uploadFiles(file);

    // Handle potential errors from UploadThing
    if (response.error) {
      console.error('UploadThing API error response object:', response.error);
      // Construct a meaningful error message from UploadThing's response
      let errorMessage = "UploadThing API processing error.";
      if (response.error instanceof Error) {
        errorMessage = response.error.message;
      } else if (typeof response.error === 'object' && response.error !== null && 'message' in response.error) {
        // Ensure message is a string, as it can sometimes be other types.
        errorMessage = String(response.error.message) + (response.error.code ? ` (Code: ${response.error.code})` : '');
      } else if (typeof response.error === 'string') {
        errorMessage = response.error;
      }
      return json({ error: errorMessage }, { status: 500 });
    }

    // Ensure data is present in the response from UploadThing
    if (!response.data || !response.data.url) {
      console.error('UploadThing API error: No data or URL returned in response. Response:', response);
      return json({ error: 'UploadThing API error: No data or URL returned.' }, { status: 500 });
    }

    // Return the URL in the format: [{ url: "..." }]
    // This matches the structure your original code was trying to return.
    return json([{ url: response.data.url }]);

  } catch (error) {
    // Catch any other unexpected errors during the process
    console.error('Error in POST /api/uploadthing endpoint:', error);
    const message = error instanceof Error ? error.message : "An unexpected server error occurred.";
    return json({ error: message }, { status: 500 });
  }
}
