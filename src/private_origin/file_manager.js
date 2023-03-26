if (window.FileSystemOriginPrivate) {
  console.log("browser does support private origin space");
} else {
  console.log("Sorry !! browser does support private origin space");
}

let total_ops = 0;
let used_ops = 0;
navigator.webkitPersistentStorage.queryUsageAndQuota(
  function (used, total) {
    total_ops = total;
    used_ops = used;
    console.log(
      `private open space used is ${used_ops / 1e6} MB for total of ${
        total_ops / 1e9
      } GB`
    );
  },
  function (error) {
    console.error("Error getting origin-private file system size:", error);
  }
);

let available_ops = total_ops - used_ops;

let clear = async () => {
  const root = await navigator.storage.getDirectory();
  const fileNames = await root.keys();
  const files = Array.from(fileNames);
  console.log(files);
  for (const fileName of files) {
    console.log(fileName);
    const fileHandle = await root.getFileHandle("0-0-0-0");
    await fileHandle.remove();
  }
};

let write = async (fileName, textToWrite) => {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(`${fileName}.txt`, {
    create: true,
  });
  const writableStream = await fileHandle.createWritable();
  writableStream.write(textToWrite);
};

let read = async (fileName) => {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(`${fileName}.txt`, {
    create: false,
  });
  let file = await fileHandle.getFile();
  let content = await file.text();
  if (content) {
    return JSON.parse(content);
  }
  return null;
};

let doesExist = async (fileName) => {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`${fileName}.txt`);
    const permissionStatus = await fileHandle.queryPermission();
    return true;
  } catch (error) {
    if (error.name === "NotFoundError") {
      console.log("file not found");
      return false;
    } else {
      console.error("Error checking if file exists:", error);
      return false;
    }
  }
};

export { write, read, doesExist, clear };
