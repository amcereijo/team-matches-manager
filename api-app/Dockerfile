# Use an official Node runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Install SQLite3
# RUN apt-get update && apt-get install -y sqlite3

# Create a directory for our SQLite database
RUN mkdir -p /usr/src/app/data

# Copy package.json and package-lock.json
# COPY package*.json ./

# # Install any needed packages
# RUN npm install

# Bundle app source
COPY . .

RUN rm -rf node_modules

# Install any needed packages
RUN npm install

# Build TypeScript files
RUN npm run build

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Run the app when the container launches
CMD ["npm", "start"]
