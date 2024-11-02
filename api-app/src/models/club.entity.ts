import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity()
export class Club {
    @PrimaryColumn({ type: "int" })
    code!: number;

    @Column({ type: "varchar" })
    name!: string;

    constructor(code: number, name: string) {
        this.code = code;
        this.name = name;
    }
}
