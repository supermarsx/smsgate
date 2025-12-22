import path from "path";

export const serverConfig = {
  authorization: {
    token: {
      clientId: ["#XCLIENTID1"],
      accessCode: ["#PIN1", "#PIN2"],
      hashedCode: [] as string[],
      useHashed: false
    },
    salt: "#SALT"
  },
  server: {
    port: 3000,
    wsPath: "/ws"
  },
  management: {
    messages: {
      keep: 10,
      purgeOld: true
    }
  },
  persistence: {
    type: "memory" as "memory" | "json",
    filePath: path.join(process.cwd(), "data", "messages.json")
  }
};
