const express = require("express");
const connectDB = require("./config/connectDB");
const cors = require("cors");
const app = express();
const PORT = 8080;
const User = require("./models/user");
const Post = require("./models/post");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const secretKey = "cats";
const dotenv = require("dotenv").config();
const cookieParser = require("cookie-parser");
const multer = require("multer");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const bucket = "dragos-blog-app";

app.use(cors({ credentials: true, origin: "http://localhost:3000" }));
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(__dirname + "/uploads"));

async function uploadToS3(path, originalFilename, mimetype) {
  const client = new S3Client({
    region: "eu-north-1",
    credentials: {
      accessKeyId: process.env.S3_ACCES_KEY,
      secretAccessKey: process.env.S3_SECRET_ACCES_KEY,
    },
  });
  const parts = originalFilename.split(".");
  const ext = parts[parts.length - 1];
  const newFilename = Date.now() + "." + ext;
  const data = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Body: fs.readFileSync(path),
      Key: newFilename,
      ContentType: mimetype,
      ACL: "public-read",
    })
  );
  return `https://${bucket}.s3.amazonaws.com/${newFilename}`;
}

app.post("/register", async (req, res) => {
  connectDB();

  const { username, password } = req.body;
  try {
    const hashedPass = await bcrypt.hash(password, 10);
    const userDoc = new User({ username: username, password: hashedPass });
    await userDoc.save();
    res.json(userDoc);
  } catch (err) {
    res.status(400).json(err);
  }
});

app.post("/login", async (req, res) => {
  connectDB();

  const { username, password } = req.body;
  try {
    const userDoc = await User.findOne({ username: username }).exec();
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      //login
      jwt.sign({ username, id: userDoc._id }, secretKey, {}, (err, token) => {
        if (err) throw err;
        res.cookie("token", token).json({
          id: userDoc._id,
          username,
        });
      });
    } else {
      res.status(400).json("wrong creddintials");
    }
  } catch (err) {
    res.status(400).json(err);
  }
});

app.get("/", (req, res) => {
  connectDB();

  res.send("hello");
});

app.get("/profile", (req, res) => {
  connectDB();

  const { token } = req.cookies;
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }
  jwt.verify(token, secretKey, {}, (err, info) => {
    if (err) {
      throw err;
    }
    res.json(info);
  });
});

app.post("/logout", (req, res) => {
  connectDB();

  res.cookie("token", " ").json("ok");
});

const uploadMiddleware = multer({ dest: "/tmp" });

app.post("/post", uploadMiddleware.single("file"), async (req, res) => {
  connectDB();

  const { originalname, path, mimetype } = req.file;
  // const parts = originalname.split(".");
  // const ext = parts[parts.length - 1];
  // const newPath = path + "." + ext;
  // fs.renameSync(path, newPath);

  const newPath = await uploadToS3(path, originalname, mimetype);

  const { token } = req.cookies;
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }
  jwt.verify(token, secretKey, {}, async (err, info) => {
    if (err) {
      throw err;
    }
    const { title, summary, content } = req.body;
    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover: newPath,
      author: info.id,
    });
    res.json(postDoc);
  });
});

app.get("/post", async (req, res) => {
  connectDB();

  const posts = await Post.find()
    .populate("author", ["username"])
    .sort({ createdAt: -1 })
    .limit(20);
  res.json(posts);
});

app.get("/post/:id", async (req, res) => {
  connectDB();
  const { id } = req.params;
  const postDoc = await Post.findById(id).populate("author", ["username"]);
  res.json(postDoc);
});

app.listen(PORT || 8080, () =>
  console.log(`The server is live on localhost:${PORT}`)
);
